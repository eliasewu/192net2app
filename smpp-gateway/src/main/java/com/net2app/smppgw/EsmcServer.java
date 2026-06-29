package com.net2app.smppgw;

import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import org.jsmpp.SMPPConstant;
import org.jsmpp.bean.AlertNotification;
import org.jsmpp.bean.BindType;
import org.jsmpp.bean.CancelSm;
import org.jsmpp.bean.DataSm;
import org.jsmpp.bean.DeliverSm;
import org.jsmpp.bean.QuerySm;
import org.jsmpp.bean.ReplaceSm;
import org.jsmpp.bean.SubmitMulti;
import org.jsmpp.bean.SubmitMultiResult;
import org.jsmpp.bean.SubmitSm;
import org.jsmpp.extra.SessionState;
import org.jsmpp.session.BindRequest;
import org.jsmpp.session.DataSmResult;
import org.jsmpp.session.ServerMessageReceiverListener;
import org.jsmpp.session.SMPPServerSession;
import org.jsmpp.session.SMPPServerSessionListener;
import org.jsmpp.session.Session;
import org.jsmpp.util.MessageId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ESMC (External Short Message Entity) server role — INBOUND SMPP binds
 * from external SMS clients (ESMEs).
 *
 * Java 21 + jSMPP 2.3.11:
 *   - Real byte-level SMPP PDU parsing via SMPPServerSessionListener.accept()
 *     → BindRequest, not a JSON-over-HTTP shim.
 *   - Each accepted session is handed to a virtual-thread handler so the
 *     accept loop I/O thread stays free for the next concurrent bind.
 *   - Authentication delegates to BackendProxy.authenticateClient (call into
 *     Node → Postgres clients table) inside the bind handler; bind is
 *     rejected with STAT_ESME_RBINDFAIL on negative result.
 *   - Inbound submit_sm PDUs route through SmscManager.submitSm(...) which
 *     forwards them to the selected supplier for the destination's MCC.
 *
 * Bound ESME sessions are recorded in GatewayState.esmeSessions, keyed by
 * a stable smpp_session_id, so DlrRouter can route delivery_sm responses
 * back to the originating client.
 */
public class EsmcServer {
    private static final Logger log = LoggerFactory.getLogger(EsmcServer.class);

    private final GatewayState state;
    private final SmscManager smscManager;
    private final AtomicLong sessionCounter = new AtomicLong(0);

    private SMPPServerSessionListener smppServer;
    private Thread acceptThread;
    private final ExecutorService vtExecutor = Executors.newVirtualThreadPerTaskExecutor();

    public EsmcServer(GatewayState state, SmscManager smscManager) {
        this.state = state;
        this.smscManager = smscManager;
    }

    public void start(String host, int port) {
        try {
            smppServer = new SMPPServerSessionListener(port);
            // Bind-address override is not supported by SMPPServerSessionListener;
            // bind to 0.0.0.0 by default. For host-specific binding, use iptables
            // or a reverse proxy in front of the gateway.
            log.info("[ESMC] listening for jSMPP binds on {}:{}", host, port);

            acceptThread = Thread.ofVirtual().name("esmc-accept").unstarted(this::acceptLoop);
            acceptThread.start();
        } catch (Exception e) {
            throw new RuntimeException("Failed to bind ESMC to " + host + ":" + port, e);
        }
    }

    private void acceptLoop() {
        try {
            while (smppServer != null && Thread.currentThread().isAlive()) {
                try {
                    SMPPServerSession session = smppServer.accept();
                    // Per-session state listener: wires cleanup on close for
                    // each accepted session (replaces deprecated server-level listener).
                    // Also notifies the Node backend so the DB stays in sync.
                    session.addSessionStateListener((newState, oldState, source) -> {
                        if (newState == SessionState.CLOSED && source instanceof SMPPServerSession sess) {
                            state.esmeSessions.entrySet().removeIf(e -> {
                                if (e.getValue().session() == sess) {
                                    GatewayState.EsmeSession es = e.getValue();
                                    log.info("[ESMC] session {} (system_id={}) closed — notifying backend",
                                             e.getKey(), es.systemId());
                                    BackendProxy.notifyBindEvent(es.entityType(), es.entityId(),
                                        es.entityCode(), es.systemId(), es.remoteIp(),
                                        es.bindMode(), es.smppSessionId(),
                                        "unbound", es.negotiatedVersion());
                                    return true;
                                }
                                return false;
                            });
                        }
                    });
                    vtExecutor.submit(() -> handleNewSession(session));
                } catch (Exception e) {
                    if (smppServer == null) break;
                    log.warn("[ESMC] accept loop error", e);
                }
            }
        } catch (Exception e) {
            log.error("[ESMC] accept loop crashed", e);
        }
    }

    /** Auth + listener-wiring per accepted bind. Runs on a virtual thread. */
    private void handleNewSession(SMPPServerSession session) {
        String remoteIp = "unknown";
        try { remoteIp = session.getInetAddress().getHostAddress(); } catch (Exception ignored) {}
        String smppSessionId = "esme-" + sessionCounter.incrementAndGet() + "-" + UUID.randomUUID();

        BindRequest req;
        try {
            req = session.waitForBind(5000);
        } catch (Exception e) {
            log.warn("[ESMC] waitForBind timed out / error from {}", remoteIp, e);
            try { session.unbindAndClose(); } catch (Exception ignored) {}
            return;
        }

        AuthResult ar = BackendProxy.authenticateClient(req.getSystemId(), req.getPassword(), remoteIp);
        if (!ar.ok) {
            log.warn("[ESMC] auth rejected for system_id={} from {}: {}", req.getSystemId(), remoteIp, ar.reason);
            try { req.reject(SMPPConstant.STAT_ESME_RBINDFAIL); } catch (Exception e) { log.warn("reject failed", e); }
            try { session.unbindAndClose(); } catch (Exception ignored) {}
            return;
        }

        // Clean up only DEAD (CLOSED) zombie sessions for this system_id.
        // Live sessions stay — the state listener will clean them when they
        // eventually close. This prevents thrashing when a client's bind
        // retry races against the previous bind's accept.
        state.esmeSessions.entrySet().removeIf(e -> {
            if (e.getValue().systemId() != null && e.getValue().systemId().equals(req.getSystemId())
                && e.getValue().session() != null
                && e.getValue().session().getSessionState() == SessionState.CLOSED) {
                log.info("[ESMC] cleaning zombie session {} for system_id={}", e.getKey(), req.getSystemId());
                BackendProxy.notifyBindEvent(e.getValue().entityType(), e.getValue().entityId(),
                    e.getValue().entityCode(), e.getValue().systemId(), e.getValue().remoteIp(),
                    e.getValue().bindMode(), e.getValue().smppSessionId(),
                    "unbound", e.getValue().negotiatedVersion());
                return true;
            }
            return false;
        });

        // Attach listener BEFORE accepting so the gateway is ready for
        // immediate post-bind PDUs (enquire_link, submit_sm).
        session.setMessageReceiverListener(new ServerReceiver(ar, smppSessionId));

        // Check session didn't die during auth (race condition guard).
        if (session.getSessionState() == SessionState.CLOSED) {
            log.warn("[ESMC] session {} died during auth for system_id={} — discarding",
                     smppSessionId, req.getSystemId());
            return;
        }

        try { req.accept(req.getSystemId()); } catch (Exception e) {
            log.error("[ESMC] bind accept failed", e);
            try { session.unbindAndClose(); } catch (Exception ignored) {}
            return;
        }

        BindType bt = req.getBindType();
        String bindMode = bt == null ? "transceiver" : bt.name();
        int negotiatedVersion = req.getInterfaceVersion().value() & 0xff;

        state.esmeSessions.put(smppSessionId, new GatewayState.EsmeSession(
            smppSessionId, ar.entityType, ar.entityId, ar.entityCode, req.getSystemId(),
            remoteIp, bindMode, System.currentTimeMillis(), session,
            negotiatedVersion));

        BackendProxy.notifyBindEvent(ar.entityType, ar.entityId, ar.entityCode, req.getSystemId(),
            remoteIp, bindMode, smppSessionId, "bound", negotiatedVersion);

        log.info("[ESMC] accepted {} bind from system_id={} entity_type={} entity_id={} ({}:{}), session={}",
                 bindMode, req.getSystemId(), ar.entityType, ar.entityId, remoteIp, negotiatedVersion, smppSessionId);
    }

    private final class ServerReceiver implements ServerMessageReceiverListener {
        private final AuthResult ar;
        private final String smppSessionId;
        ServerReceiver(AuthResult ar, String smppSessionId) {
            this.ar = ar; this.smppSessionId = smppSessionId;
        }
        @Override
        public MessageId onAcceptSubmitSm(SubmitSm submitSm, SMPPServerSession source) {
            try {
                String text = new String(submitSm.getShortMessage());
                String generatedMessageId = "SMID-" + UUID.randomUUID();
                int supplierId = pickSupplierForRouting(ar.entityId, ar.entityCode, submitSm.getDestAddress());
                String smppMsgId = smscManager.submitSm(supplierId, ar.entityId, ar.entityCode,
                    ar.entityCode + ":via_esme",
                    submitSm.getSourceAddr(), submitSm.getDestAddress(), text, generatedMessageId);
                return new MessageId(smppMsgId);
            } catch (Exception e) {
                log.error("[ESMC] submit_sm forward failed", e);
                throw new RuntimeException("submit_sm forward failed: " + e.getMessage(), e);
            }
        }
        @Override public SubmitMultiResult onAcceptSubmitMulti(SubmitMulti submitMulti, SMPPServerSession source) {
            return null;
        }
        @Override public DataSmResult onAcceptDataSm(DataSm dataSm, Session source) {
            return null;
        }
        @Override public org.jsmpp.session.QuerySmResult onAcceptQuerySm(QuerySm querySm, SMPPServerSession source) {
            return null;
        }
        public void onAcceptDeliverSm(DeliverSm deliverSm) {
            try {
                if (deliverSm.isSmscDeliveryReceipt()) {
                    String smppMsgId = deliverSm.getShortMessageAsDeliveryReceipt().getId();
                    log.info("[ESME] DLR ack from session {} smpp_msg_id={}", smppSessionId, smppMsgId);
                    // Resolve pending submit (inbound supplier DLR)
                    GatewayState.PendingSubmit ps = state.pendingSm.remove(smppMsgId);
                    if (ps != null) {
                        var dr = deliverSm.getShortMessageAsDeliveryReceipt();
                        smscManager.dlrRouter().handleDlr(new DlrRouter.DlrPayload(
                            ps.messageId(), smppMsgId,
                            ps.clientId(), ps.supplierId(),
                            ps.clientCode(), ps.supplierCode(),
                            ps.destination(), ps.sourceAddr(),
                            dr.getFinalStatus().name(),
                            dr.getError() == null ? "000" : String.valueOf(dr.getError()),
                            System.currentTimeMillis()));
                    }
                }
            } catch (Exception e) { log.warn("[ESME] receipt parse error", e); }
        }
        public void onAcceptAlertNotification(AlertNotification alertNotification) {}
        @Override public void onAcceptReplaceSm(ReplaceSm replaceSm, SMPPServerSession source) {}
        @Override public void onAcceptCancelSm(CancelSm cancelSm, SMPPServerSession source) {}
    }

    /**
     * Resolve the best supplier for this destination by consulting the
     * backend's route_maps (MCCMNC-pattern matching). Falls back to the
     * first bound outbound supplier if the backend is unreachable or
     * returns no match.
     */
    private int pickSupplierForRouting(int clientId, String clientCode, String destination) {
        // 1) Try backend route_maps lookup (preferred)
        try {
            com.fasterxml.jackson.databind.JsonNode route = BackendProxy.fetchRouteForDestination(
                clientId, destination, clientCode);
            if (route != null) {
                int supplierId = route.path("supplier_id").asInt(0);
                if (supplierId > 0) {
                    String routeName = route.path("route_name").asText("unknown");
                    String trunkName = route.path("trunk_name").asText(null);
                    int trunkId = route.path("trunk_id").asInt(0);
                    log.info("[ESMC] route_maps resolved client={} dest={} -> supplier={} route={} trunk={}",
                             clientId, destination, supplierId, routeName,
                             trunkName != null ? trunkId + ":" + trunkName : "direct");
                    return supplierId;
                }
            }
        } catch (Exception e) {
            log.warn("[ESMC] route lookup failed, falling back to first bound: {}", e.getMessage());
        }
        // 2) Fallback: pick the lowest-id bound outbound supplier
        var bound = smscManager.listBound();
        return bound.isEmpty() ? 0 : bound.get(0);
    }

    public void stop() {
        log.info("[ESMC] stopping ({} active session(s))", state.esmeSessions.size());
        try {
            if (smppServer != null) smppServer.close();
        } catch (Exception e) { log.warn("smppServer.close failed", e); }
        smppServer = null;
        state.esmeSessions.values().forEach(e -> {
            try { if (e.session() != null) e.session().unbindAndClose(); } catch (Exception ignored) {}
        });
        state.esmeSessions.clear();
        vtExecutor.shutdown();
    }

    public static class AuthResult {
        public final boolean ok;
        public final String reason;
        public final String entityType;
        public final int entityId;
        public final String entityCode;
        public AuthResult(boolean ok, String reason, String entityType, int entityId, String entityCode) {
            this.ok = ok; this.reason = reason; this.entityType = entityType; this.entityId = entityId; this.entityCode = entityCode;
        }
    }
}
