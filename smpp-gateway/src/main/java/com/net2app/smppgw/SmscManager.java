package com.net2app.smppgw;

import org.jsmpp.bean.BindType;
import org.jsmpp.bean.NumberingPlanIndicator;
import org.jsmpp.bean.TypeOfNumber;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * SMSC (Short Message Service Center) client manager. Owns one outbound
 * SMPP session per supplier. When /submit_sm arrives, picks the right
 * supplier session and dispatches the submit_sm PDU via jSMPP.
 *
 * Java 21: ConcurrentHashMap.compute() is the single point where a supplier's
 * session is (re)bound, so concurrent bind/unbind calls can't race in
 * leaving a half-closed session in state.smscSessions.
 */
public class SmscManager {
    private static final Logger log = LoggerFactory.getLogger(SmscManager.class);

    private final GatewayState state;
    private final Map<Integer, SmscClient> clients = new ConcurrentHashMap<>();
    private final DlrRouter dlrRouter;

    public SmscManager(GatewayState state) {
        this.state = state;
        this.dlrRouter = new DlrRouter(state);
    }

    public DlrRouter dlrRouter() { return dlrRouter; }

    /**
     * Bind (or rebind) a single supplier. If a previous session exists, close
     * it BEFORE attempting a new bind so we never accumulate zombie sockets.
     * Returns true only on a real jSMPP bind handshake success.
     */
    public boolean bindSupplier(int supplierId, String host, int port,
                                 String systemId, String password,
                                 String systemType,
                                 BindType bindType,
                                 TypeOfNumber addrTon, NumberingPlanIndicator addrNpi,
                                 String addrRange,
                                 byte interfaceVersion) {
        SmscClient result = clients.compute(supplierId, (id, existing) -> {
            if (existing != null) {
                log.info("[SMSC] rebind: closing existing session for supplier {}", id);
                try { existing.close(); } catch (Exception e) { log.warn("[SMSC] existing.close failed", e); }
            }
            SmscClient c = new SmscClient(supplierId, host, port, systemId, password,
                systemType, bindType, addrTon, addrNpi, addrRange, interfaceVersion, state, dlrRouter);
            return c.bind() ? c : null;
        });
        return result != null && result.isBound();
    }

    /**
     * Auto-negotiate the highest supported SMPP version with a supplier.
     * Tries v5.0 (0x50), then v3.4 (0x34), then v3.3 (0x33), returning
     * the successfully negotiated version byte. Returns 0 if all fail.
     *
     * Each attempt closes any half-open session before trying the next
     * version so suppliers that reject the first version with an
     * unbind don't leave zombie sockets.
     */
    public byte bindSupplierAuto(int supplierId, String host, int port,
                                  String systemId, String password, String systemType,
                                  BindType bindType,
                                  TypeOfNumber addrTon, NumberingPlanIndicator addrNpi,
                                  String addrRange) {
        // SMPP interface_version bytes per spec: v3.3=0x33, v3.4=0x34, v5.0=0x50
        byte[] versionsToTry = { (byte) 0x50, (byte) 0x34, (byte) 0x33 };

        for (byte ver : versionsToTry) {
            String hexVer = String.format("0x%02X", ver & 0xff);
            log.info("[SMSC] auto-negotiation: trying interface_version={} for supplier {}",
                     hexVer, supplierId);
            if (bindSupplier(supplierId, host, port, systemId, password, systemType,
                             bindType, addrTon, addrNpi, addrRange, ver)) {
                log.info("[SMSC] auto-negotiation: bound supplier {} with interface_version={}",
                         supplierId, hexVer);
                return ver;
            }
            log.info("[SMSC] auto-negotiation: version {} failed for supplier {}, trying next...",
                     hexVer, supplierId);
            // Brief pause between attempts so the supplier's stack can fully
            // release the previous half-broken socket before the next connect.
            try { Thread.sleep(500); } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        log.warn("[SMSC] auto-negotiation: all versions (v5.0, v3.4, v3.3) failed for supplier {}",
                 supplierId);
        return 0;
    }

    public boolean unbindSupplier(int supplierId) {
        SmscClient c = clients.remove(supplierId);
        state.smscSessions.remove(supplierId);
        if (c != null) { c.close(); return true; }
        return false;
    }

    public boolean isBound(int supplierId) {
        SmscClient c = clients.get(supplierId);
        return c != null && c.isBound();
    }

    public List<Integer> listBound() {
        return clients.entrySet().stream()
            .filter(e -> e.getValue().isBound())
            .map(Map.Entry::getKey)
            .collect(java.util.stream.Collectors.toUnmodifiableList());
    }

    public SmscClient get(int supplierId) { return clients.get(supplierId); }

    /**
     * Dispatch a submit_sm through the supplier's SMPP session.
     * For inbound suppliers (entityType='supplier' on an ESME session),
     * pushes a deliver_sm to the supplier's bound ESME session instead.
     * Returns the smpp_message_id assigned by the supplier.
     */
    public String submitSm(int supplierId, int clientId, String clientCode,
                            String supplierCode, String sourceAddr, String destination,
                            String text, String messageId) {
        // Check for inbound supplier bound on ESME port
        var inboundSession = state.esmeSessions.values().stream()
            .filter(s -> "supplier".equals(s.entityType()) && s.entityId() == supplierId)
            .findFirst();

        if (inboundSession.isPresent()) {
            GatewayState.EsmeSession es = inboundSession.get();
            if (es.session() == null || !es.session().getSessionState().isBound()) {
                throw new IllegalStateException("Inbound supplier " + supplierId + " not bound");
            }
            try {
                es.session().deliverShortMessage(
                    "CMT",
                    org.jsmpp.bean.TypeOfNumber.UNKNOWN,
                    org.jsmpp.bean.NumberingPlanIndicator.UNKNOWN,
                    destination,
                    org.jsmpp.bean.TypeOfNumber.UNKNOWN,
                    org.jsmpp.bean.NumberingPlanIndicator.UNKNOWN,
                    sourceAddr,
                    new org.jsmpp.bean.ESMClass(),
                    (byte) 0, (byte) 1,
                    new org.jsmpp.bean.RegisteredDelivery((byte) 0),
                    new org.jsmpp.bean.GeneralDataCoding(org.jsmpp.bean.Alphabet.ALPHA_DEFAULT),
                    text.getBytes());
                // DLR for inbound suppliers is pushed back via deliver_sm receipt
                String smppMsgId = "DELIV-" + java.util.UUID.randomUUID();
                state.pendingSm.put(smppMsgId, new GatewayState.PendingSubmit(
                    clientId, supplierId, clientCode, supplierCode, messageId, destination, sourceAddr,
                    System.currentTimeMillis()));
                return smppMsgId;
            } catch (Exception e) {
                throw new RuntimeException("Inbound supplier " + supplierId + " deliver_sm failed: " + e.getMessage(), e);
            }
        }

        // Outbound supplier — existing SmscClient dispatch
        SmscClient c = clients.get(supplierId);
        if (c == null || !c.isBound()) {
            throw new IllegalStateException("Supplier " + supplierId + " not bound");
        }
        return c.submitSm(clientId, clientCode, supplierCode, sourceAddr, destination, text, messageId);
    }

    public void shutdown() {
        log.info("[SMSC] shutting down {} session(s)", clients.size());
        clients.values().forEach(c -> { try { c.close(); } catch (Exception e) { /* ignore */ } });
        clients.clear();
    }
}
