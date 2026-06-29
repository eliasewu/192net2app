package com.net2app.smppgw;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.jsmpp.bean.Alphabet;
import org.jsmpp.bean.BindType;
import org.jsmpp.bean.DeliverSm;
import org.jsmpp.bean.DeliveryReceipt;
import org.jsmpp.bean.ESMClass;
import org.jsmpp.bean.GeneralDataCoding;
import org.jsmpp.bean.MessageMode;
import org.jsmpp.bean.MessageType;
import org.jsmpp.bean.NumberingPlanIndicator;
import org.jsmpp.bean.RegisteredDelivery;
import org.jsmpp.bean.SMSCDeliveryReceipt;
import org.jsmpp.bean.TypeOfNumber;
import org.jsmpp.extra.SessionState;
import org.jsmpp.session.DataSmResult;
import org.jsmpp.session.MessageReceiverListener;
import org.jsmpp.session.Session;
import org.jsmpp.session.SMPPSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * SMSC client (outbound to ONE supplier). Opens a real jSMPP SMPPSession,
 * listens for delivery_sm PDUs, and routes them through DlrRouter.
 *
 * Java 21: virtual-thread executor for inbound DLR handling (one VT per
 * delivery_sm keeps the SMPPSession I/O thread free to accept more PDUs
 * from the supplier).
 *
 * AUTO-REBIND: When the session drops (SessionState.CLOSED), a scheduled
 * rebind is queued with exponential backoff: 1s → 2s → 4s → 8s → ... →
 * max 60s. After 10 consecutive failures, the rebind loop gives up and
 * the supplier is marked as permanently disconnected until a manual
 * reconnect is issued.
 *
 * Bind attributes:
 *   - system_type: per-supplier ("" | "CMT" | "SMPP" | "VMA" | custom)
 *   - bind_type:    BIND_TRANSCEIVER (send + receive both directions)
 *   - addr:         TypeOfNumber.UNKNOWN + NPI.UNKNOWN (supplier-specific)
 */
public class SmscClient {
    private static final Logger log = LoggerFactory.getLogger(SmscClient.class);

    private static final long[] REBIND_BACKOFF_MS = {1000, 2000, 4000, 8000, 16000, 30000, 60000};
    private static final int MAX_REBIND_ATTEMPTS = envInt("SMSC_MAX_REBIND_ATTEMPTS", 10);

    /** Parse an integer env var with a fallback default; never throws. */
    private static int envInt(String key, int fallback) {
        try {
            int val = Integer.parseInt(System.getenv().getOrDefault(key, String.valueOf(fallback)));
            return val > 0 ? val : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private final int supplierId;
    private final String host;
    private final int port;
    private final String systemId;
    private final String password;
    private final String systemType;
    private final BindType bindType;
    private final TypeOfNumber addrTon;
    private final NumberingPlanIndicator addrNpi;
    private final String addrRange;
    private final byte interfaceVersion;
    private final GatewayState state;
    private final DlrRouter dlrRouter;
    private final ExecutorService vtExecutor = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService rebindScheduler;
    private final AtomicInteger rebindAttempt = new AtomicInteger(0);
    private final AtomicBoolean rebindScheduled = new AtomicBoolean(false);

    /** Resolve the address_range config string to an actual SMPP value.
     *  "system_id" → this.systemId, "" → "", anything else → null. */
    private String resolveAddrRange(String config) {
        if ("system_id".equals(config)) {
            return (systemId != null && !systemId.isBlank()) ? systemId : null;
        }
        if ("".equals(config)) return "";
        if ("null".equals(config)) return null;
        return config != null && !config.isBlank() ? config : null;
    }

    private SMPPSession session;
    private volatile boolean bound = false;

    public SmscClient(int supplierId, String host, int port,
                      String systemId, String password,
                      String systemType,
                      BindType bindType,
                      TypeOfNumber addrTon, NumberingPlanIndicator addrNpi,
                      String addrRange,
                      byte interfaceVersion,
                      GatewayState state, DlrRouter dlrRouter) {
        if (supplierId <= 0) throw new IllegalArgumentException("supplierId must be > 0");
        if (host == null || host.isBlank()) throw new IllegalArgumentException("host required");
        if (port <= 0 || port > 65535) throw new IllegalArgumentException("port out of range");
        if (systemId == null || systemId.isBlank()) throw new IllegalArgumentException("systemId required");
        this.supplierId = supplierId;
        this.host = host;
        this.port = port;
        this.systemId = systemId;
        this.password = password;
        this.systemType = systemType != null ? systemType : "";
        this.bindType = bindType != null ? bindType : BindType.BIND_TRX;
        this.addrTon = addrTon != null ? addrTon : TypeOfNumber.UNKNOWN;
        this.addrNpi = addrNpi != null ? addrNpi : NumberingPlanIndicator.UNKNOWN;
        this.addrRange = resolveAddrRange(addrRange);
        this.interfaceVersion = interfaceVersion;
        this.state = state;
        this.dlrRouter = dlrRouter;
        this.rebindScheduler = Executors.newSingleThreadScheduledExecutor(
            r -> Thread.ofVirtual().name("smpp-rebind-" + this.supplierId).unstarted(r));
    }

    public boolean bind() {
        try {
            session = new SMPPSession();
            session.setMessageReceiverListener(new SessionReceiver());
            session.addSessionStateListener((newState, oldState, source) -> {
                if (newState == SessionState.CLOSED) {
                    log.warn("[SMSC] Supplier {} disconnected", supplierId);
                    bound = false;
                    state.smscSessions.remove(supplierId);
                    // Trigger auto-rebind
                    scheduleRebind();
                }
            });

            // Per-supplier configurable bind parameters for universal SMSC support.
            session.connectAndBind(
                host, port,
                new org.jsmpp.session.BindParameter(
                    bindType, systemId, password, systemType,
                    addrTon, addrNpi, addrRange),
                /*timeoutMs=*/ 5000);

            state.smscSessions.put(supplierId, session);
            bound = true;
            rebindAttempt.set(0);   // reset backoff on successful bind
            log.info("[SMSC] bound to supplier {} at {}:{} as system_id={} version=0x{}",
                     supplierId, host, port, systemId,
                     String.format("%02X", interfaceVersion & 0xff));
            // Notify Node backend about successful (re)bind
            BackendProxy.notifyBindEvent("supplier", supplierId, null, systemId,
                host, "transceiver", "smsc-" + supplierId, "bound", interfaceVersion & 0xff);
            return true;
        } catch (Exception e) {
            log.error("[SMSC] bind failed for supplier {}", supplierId, e);
            bound = false;
            // Clean up the half-open session so we don't leak sockets during
            // auto-negotiation (bindSupplierAuto tries multiple versions).
            if (session != null) {
                try { session.close(); } catch (Exception ignored) {}
                session = null;
            }
            return false;
        }
    }

    public boolean isBound() { return bound && session != null && session.getSessionState().isBound(); }

    public int getSupplierId() { return supplierId; }
    public byte getInterfaceVersion() { return interfaceVersion; }

    public synchronized void close() {
        bound = false;
        rebindScheduled.set(false);
        if (session != null) {
            try { session.unbindAndClose(); } catch (Exception e) { log.warn("[SMSC] unbind failed supplier {}", supplierId, e); }
            session = null;
        }
        state.smscSessions.remove(supplierId);
        rebindAttempt.set(0);
        rebindScheduler.shutdownNow();
        log.info("[SMSC] unbound supplier {}", supplierId);
    }

    /**
     * Schedule an auto-rebind after a disconnect. Uses exponential backoff:
     * 1s, 2s, 4s, 8s, 16s, 30s, 60s, capped at 60s.
     * After MAX_REBIND_ATTEMPTS consecutive failures, gives up and notifies
     * the backend that the supplier is permanently unbound.
     */
    private void scheduleRebind() {
        if (!rebindScheduled.compareAndSet(false, true)) return;
        int attempt = rebindAttempt.incrementAndGet();
        if (attempt > MAX_REBIND_ATTEMPTS) {
            log.error("[SMSC] supplier {} auto-rebind exhausted after {} attempts — giving up",
                      supplierId, MAX_REBIND_ATTEMPTS);
            BackendProxy.notifyBindEvent("supplier", supplierId, null, systemId,
                host, "transceiver", "smsc-" + supplierId, "unbound", 0);
            rebindScheduled.set(false);
            return;
        }
        long delay = REBIND_BACKOFF_MS[Math.min(attempt - 1, REBIND_BACKOFF_MS.length - 1)];
        log.info("[SMSC] supplier {} auto-rebind attempt {}/{} in {}ms",
                 supplierId, attempt, MAX_REBIND_ATTEMPTS, delay);
        rebindScheduler.schedule(() -> {
            rebindScheduled.set(false);
            if (bound) return; // already reconnected via manual intervention
            log.info("[SMSC] auto-rebinding supplier {} (attempt {})", supplierId, attempt);
            boolean ok = bind();
            if (!ok && rebindAttempt.get() < MAX_REBIND_ATTEMPTS) {
                scheduleRebind();
            }
        }, delay, TimeUnit.MILLISECONDS);
    }

    /**
     * Real submit_short_message via jSMPP. registered_delivery = SUCCESS_FAILURE
     */
    public String submitSm(int clientId, String clientCode, String supplierCode,
                            String sourceAddr, String destination, String text, String messageId) {
        if (!isBound()) throw new IllegalStateException("Not bound to supplier " + supplierId);
        try {
            String smppMsgId = session.submitShortMessage(
                "CMT",
                TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, sourceAddr,
                TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, destination,
                new ESMClass(), (byte) 0, (byte) 1,
                /*scheduleDeliveryTime*/ null, /*validityPeriod*/ "",
                new RegisteredDelivery(SMSCDeliveryReceipt.SUCCESS_FAILURE),
                (byte) 0,
                new GeneralDataCoding(Alphabet.ALPHA_DEFAULT),
                (byte) 0,
                text.getBytes());

            state.pendingSm.put(smppMsgId, new GatewayState.PendingSubmit(
                clientId, supplierId, clientCode, supplierCode, messageId, destination, sourceAddr,
                System.currentTimeMillis()));
            log.info("[SMSC] submit_sm dispatched to supplier {} smpp_msg_id={}", supplierId, smppMsgId);
            return smppMsgId;
        } catch (Exception e) {
            throw new RuntimeException("submit_sm failed for supplier " + supplierId + ": " + e.getMessage(), e);
        }
    }

    /** Inner listener — handles inbound deliver_sm (DLR) from the supplier. */
    private final class SessionReceiver implements MessageReceiverListener {
        @Override
        public void onAcceptDeliverSm(DeliverSm deliverSm) {
            // Push to virtual thread so the SMPPSession I/O thread is freed.
            vtExecutor.submit(() -> handleDeliverSm(deliverSm));
        }
        @Override public void onAcceptAlertNotification(org.jsmpp.bean.AlertNotification alertNotification) {}
        @Override public DataSmResult onAcceptDataSm(org.jsmpp.bean.DataSm dataSm, Session source) { return null; }
    }

    private void handleDeliverSm(DeliverSm deliverSm) {
        try {
            if (!deliverSm.isSmscDeliveryReceipt()) {
                log.debug("[SMSC] supplier {} non-DLR deliver_sm discarded", supplierId);
                return;
            }
            DeliveryReceipt dr = deliverSm.getShortMessageAsDeliveryReceipt();
            log.info("[SMSC] DLR from supplier {} id={} status={} err={}",
                     supplierId, dr.getId(), dr.getFinalStatus(), dr.getError());
            GatewayState.PendingSubmit ps = state.pendingSm.remove(dr.getId());
            if (ps == null) {
                log.warn("[SMSC] DLR id={} but no pending submit – discarding", dr.getId());
                return;
            }
            dlrRouter.handleDlr(new DlrRouter.DlrPayload(
                ps.messageId(), dr.getId(),
                ps.clientId(), ps.supplierId(),
                ps.clientCode(), ps.supplierCode(),
                ps.destination(), ps.sourceAddr(),
                dr.getFinalStatus().name(),
                dr.getError() == null ? "000" : String.valueOf(dr.getError()),
                System.currentTimeMillis()));
        } catch (Exception e) {
            log.error("[SMSC] DLR parse error supplier {}", supplierId, e);
        }
    }
}
