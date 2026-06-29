package com.net2app.smppgw;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.StructuredTaskScope;

import org.jsmpp.bean.Alphabet;
import org.jsmpp.bean.DeliverSm;
import org.jsmpp.bean.DeliveryReceipt;
import org.jsmpp.bean.ESMClass;
import org.jsmpp.bean.GSMSpecificFeature;
import org.jsmpp.bean.GeneralDataCoding;
import org.jsmpp.bean.MessageMode;
import org.jsmpp.bean.MessageType;
import org.jsmpp.bean.NumberingPlanIndicator;
import org.jsmpp.bean.RegisteredDelivery;
import org.jsmpp.bean.TypeOfNumber;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * DLR router. For every delivery_sm or HTTP-webhook DLR, this:
 *   1) Persists into Postgres via the Node.js backend (/internal/dlr_event)
 *   2) Decides whether to push the DLR back to the originating client
 *      - If client.webhook_url is set -> POST JSON to that URL
 *      - If client is bound via ESMC SMPP -> synthesise a delivery_sm PDU
 *        and send it back through that ESME's jSMPP session (real wire)
 *   3) Honours billing_mode='dlr' by ensuring the platform side deducts cost
 *
 * Java 21: StructuredTaskScope.ShutdownOnFailure() runs the DB persist and
 * the client push in parallel on virtual threads; an exception in either
 * branch is propagated to the outer handler.
 */
public class DlrRouter {
    private static final Logger log = LoggerFactory.getLogger(DlrRouter.class);
    private final GatewayState state;

    public DlrRouter(GatewayState state) { this.state = state; }

    /**
     * Mark a smpp_msg_id delivered when the ESME acknowledged the
     * delivery_sm. Currently a no-op (the ack is fire-and-forget); kept
     * for future use if we add explicit acked-pending tracking.
     */
    public void markDelivered(String smppMsgId) {
        log.debug("[DLR] ESME-ack recorded for smpp_msg_id={}", smppMsgId);
    }

    public void handleDlr(DlrPayload payload) {
        log.info("[DLR] processing msgId={} smppMsgId={} status={} client={} supplier={}",
                 payload.messageId, payload.smppMessageId, payload.dlrStatus,
                 payload.clientId, payload.supplierId);

        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
            // Branch 1 — persist via backend
            var dbFork = scope.fork(() -> {
                try {
                    BackendProxy.notifyDlr(
                        payload.messageId, payload.smppMessageId,
                        payload.dlrStatus, payload.errorCode,
                        payload.destination, payload.clientId, payload.supplierId);
                } catch (Exception e) {
                    log.error("[DLR] backend persist failed", e);
                    throw e;
                }
                return null;
            });

            // Branch 2 — push to client (webhook OR ESMC SMPP)
            var pushFork = scope.fork(() -> {
                PushTarget target = BackendProxy.lookupClientDelivery(payload.clientId);
                if (target == null) {
                    log.warn("[DLR] no client target for id={}", payload.clientId);
                    return null;
                }
                if (target.webhookUrl != null && !target.webhookUrl.isBlank()) {
                    BackendProxy.postJsonAsync(target.webhookUrl, java.util.Map.of(
                        "message_id", payload.messageId,
                        "smpp_message_id", payload.smppMessageId,
                        "status", "DELIVRD".equals(payload.dlrStatus) ? "delivered" : "failed",
                        "dlr_status", payload.dlrStatus,
                        "error_code", payload.errorCode
                    ));
                    log.info("[DLR] webhook push queued to client {} via {}", payload.clientId, target.webhookUrl);
                    return null;
                }
                if (target.esmeSmppSessionId != null) {
                    GatewayState.EsmeSession esme = state.esmeSessions.get(target.esmeSmppSessionId);
                    if (esme != null && esme.session() != null && esme.session().getSessionState().isBound()) {
                        pushDeliverSmToEsme(esme, payload);
                        log.info("[DLR] deliver_sm pushed to client {} via session {}",
                                 payload.clientId, target.esmeSmppSessionId);
                    } else {
                        log.warn("[DLR] ESME session {} unbound – DLR not pushed",
                                 target.esmeSmppSessionId);
                    }
                }
                return null;
            });

            scope.join();           // wait for both branches
            scope.throwIfFailed();  // propagate either branch's exception
        } catch (Exception e) {
            log.error("[DLR] handleDlr failed for msgId={}", payload.messageId, e);
        }
    }

    /** Real wire push — synthesises a properly formatted SMPP delivery_sm PDU
     *  back to the client in the standard receipt format:
     *  id:{smppMsgId} sub:001 dlvrd:001 submit date:{YYMMDDhhmm} done date:{YYMMDDhhmm}
     *  stat:{dlrStatus} err:{errorCode} text:{text}
     *  The DLR's destination address is the original submit_sm's source_addr,
     *  so the client's SMPP stack correctly routes the receipt. */
    private void pushDeliverSmToEsme(GatewayState.EsmeSession esme, DlrPayload payload) {
        try {
            var now = java.time.LocalDateTime.now(ZoneId.of("UTC"));
            var fmt = DateTimeFormatter.ofPattern("yyMMddHHmm");
            String ts = now.format(fmt);
            String dlvrd = "DELIVRD".equals(payload.dlrStatus) ? "001" : "000";
            String receipt = String.format(
                "id:%s sub:001 dlvrd:%s submit date:%s done date:%s stat:%s err:%s text:%s",
                payload.smppMessageId != null ? payload.smppMessageId : "",
                dlvrd, ts, ts,
                payload.dlrStatus != null ? payload.dlrStatus : "UNDELIV",
                payload.errorCode != null ? payload.errorCode : "000",
                "");
            // DLR source = original destination (the SMSC "from" address)
            // DLR destination = original source_addr (the client's sender ID)
            // This reversal is critical: the client receives the DLR on the
            // address they submitted with, so their SMPP stack recognises it.
            String dlrSource = payload.destination != null ? payload.destination : "";
            String dlrDest = payload.sourceAddr != null ? payload.sourceAddr : "";
            esme.session().deliverShortMessage(
                "CMT",
                TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, dlrSource,
                TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, dlrDest,
                new ESMClass(MessageMode.DEFAULT, MessageType.SMSC_DEL_RECEIPT, GSMSpecificFeature.DEFAULT),
                (byte) 0, (byte) 1,
                new RegisteredDelivery((byte) 0),
                new GeneralDataCoding(Alphabet.ALPHA_DEFAULT),
                receipt.getBytes());
        } catch (Exception e) {
            log.error("[DLR] deliverShortMessage failed to {}", esme.smppSessionId(), e);
            throw new RuntimeException(e);
        }
    }

    /** Convert a jSMPP DeliveryReceipt into a DlrPayload (used by tests + future inbound paths). */
    public DlrPayload fromReceipt(DeliveryReceipt dr, int supplierId, int clientId,
                                   String clientCode, String supplierCode) {
        return new DlrPayload(
            "", dr.getId(), clientId, supplierId, clientCode, supplierCode, "", "",
            dr.getFinalStatus().name(),
            dr.getError() == null ? "000" : String.valueOf(dr.getError()),
            System.currentTimeMillis());
    }

    public record DlrPayload(
        String messageId,
        String smppMessageId,
        int clientId,
        int supplierId,
        String clientCode,
        String supplierCode,
        String destination,
        String sourceAddr,
        String dlrStatus,
        String errorCode,
        long receivedAt
    ) {}

    public record PushTarget(String webhookUrl, String esmeSmppSessionId) {}
}
