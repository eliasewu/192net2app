package com.net2app.smppgw;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import org.jsmpp.session.SMPPSession;
import org.jsmpp.session.SMPPServerSession;

/**
 * Shared state between the ESMC server, SMSC client, and REST control plane.
 *
 * - esmeSessions: active inbound SMPP binds from clients (ESMEs),
 *   keyed by smpp_session_id (String) so the DLR router can look them up.
 * - smscSessions: outbound binds to suppliers, keyed by supplier_id.
 * - pendingSm: when a submit_sm is dispatched to a supplier we save the
 *   future here by smpp_message_id; when delivery_sm comes back we resolve it.
 *
 * Java 21 records for immutable carrier data. SMPPServerSession (server-side)
 * is mutable so it stays as a record component without a custom accessor.
 */
public class GatewayState {
    public final Map<String, EsmeSession> esmeSessions = new ConcurrentHashMap<>();
    public final Map<Integer, SMPPSession> smscSessions = new ConcurrentHashMap<>();
    public final Map<String, PendingSubmit> pendingSm = new ConcurrentHashMap<>();

    /** Inbound ESME bind record. Covers both clients AND inbound suppliers.
     *  entityType is 'client' or 'supplier'; entityId/entityCode refer to the
     *  corresponding row in clients / suppliers. */
    public record EsmeSession(
        String smppSessionId,
        String entityType,
        int entityId,
        String entityCode,
        String systemId,
        String remoteIp,
        String bindMode,        // transceiver / transmitter / receiver
        long connectedAt,
        SMPPServerSession session,
        int negotiatedVersion   // SMPP interface_version byte negotiated (0x33/0x34/0x50)
    ) {}

    /** Outbound submit_sm pending a delivery_sm response. */
    public record PendingSubmit(
        int clientId,
        int supplierId,
        String clientCode,
        String supplierCode,
        String messageId,
        String destination,
        String sourceAddr,
        long submittedAt
    ) {}
}
