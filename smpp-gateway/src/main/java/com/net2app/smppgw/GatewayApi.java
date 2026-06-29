package com.net2app.smppgw;

import static spark.Spark.get;
import static spark.Spark.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsmpp.bean.BindType;
import org.jsmpp.bean.NumberingPlanIndicator;
import org.jsmpp.bean.TypeOfNumber;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST control plane exposed by the Java 21 SMPP gateway.
 * The Node.js backend uses these endpoints to:
 *   - bootstrap supplier binds
 *   - forward submit_sm
 *   - report DLRs back to clients
 *   - inspect fleet state
 *
 * Wire shape stays 1:1 with gateway-bridge.cjs (Node) so existing Node
 * callers don't need to change. /bind_supplier now also accepts an
 * `interface_version` byte for SMPP version negotiation.
 */
public class GatewayApi {
    private static final Logger log = LoggerFactory.getLogger(GatewayApi.class);

    private final GatewayState state;
    private final SmscManager smsc;
    private final ObjectMapper JSON = new ObjectMapper();

    public GatewayApi(GatewayState state, SmscManager smsc) {
        this.state = state;
        this.smsc = smsc;
    }

    public void register() {
        get("/health", (req, res) -> {
            res.type("application/json");
            return "{\"ok\":true,\"role\":\"smpp-gateway\",\"jvm_version\":\"" + Runtime.version() + "\"}";
        });

        get("/status", (req, res) -> {
            res.type("application/json");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("esme_sessions", state.esmeSessions.size());
            out.put("supplier_sessions", smsc.listBound().size());
            out.put("bound_supplier_ids", smsc.listBound());
            out.put("pending_submit_sm", state.pendingSm.size());
            out.put("jvm_version", Runtime.version().toString());
            return JSON.writeValueAsString(out);
        });

        // List active SMSC (outbound supplier) bindings
        get("/smsc/connections", (req, res) -> {
            res.type("application/json");
            return JSON.writeValueAsString(smsc.listBound());
        });

        // List active ESME (inbound client) bindings
        get("/esme/connections", (req, res) -> {
            res.type("application/json");
            return JSON.writeValueAsString(state.esmeSessions.keySet());
        });

        // Bind supplier outbound (Node calls this on /api/bind/:id/connect)
        post("/bind_supplier", (req, res) -> {
            res.type("application/json");
            try {
                JsonNode n = JSON.readTree(req.body());
                int supplierId   = n.path("supplier_id").asInt();
                String host      = n.path("smpp_host").asText();
                int port         = n.path("smpp_port").asInt(2775);
                String systemId  = n.path("smpp_username").asText();
                String password  = n.path("smpp_password").asText();
                String systemType = n.path("system_type").asText("");
                byte ifaceVer    = smppInterfaceVersionFrom(n.path("interface_version").asInt(0));

                // Per-supplier SMPP params for universal SMSC compatibility
                BindType bindType = parseBindType(n.path("bind_type").asText("trx"));
                TypeOfNumber addrTon = parseTon(n.path("addr_ton").asInt(0));
                NumberingPlanIndicator addrNpi = parseNpi(n.path("addr_npi").asInt(0));
                String addrRange = n.path("addr_range").asText("system_id");

                boolean ok;
                byte negotiatedVer;

                if (ifaceVer == 0) {
                    // Auto-detect: try v5.0, v3.4, v3.3 sequentially
                    negotiatedVer = smsc.bindSupplierAuto(supplierId, host, port, systemId, password,
                        systemType, bindType, addrTon, addrNpi, addrRange);
                    ok = negotiatedVer != 0;
                } else {
                    // Explicit version requested
                    ok = smsc.bindSupplier(supplierId, host, port, systemId, password,
                        systemType, bindType, addrTon, addrNpi, addrRange, ifaceVer);
                    negotiatedVer = ok ? ifaceVer : 0;
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", ok);
                out.put("supplier_id", supplierId);
                out.put("requested_interface_version",
                         ifaceVer == 0 ? "auto" : String.format("0x%02X", ifaceVer & 0xff));
                out.put("negotiated_interface_version",
                         ok ? String.format("0x%02X", negotiatedVer & 0xff) : null);
                return JSON.writeValueAsString(out);
            } catch (Exception e) {
                log.warn("[API] /bind_supplier error", e);
                res.status(500);
                return "{\"ok\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        });

        post("/unbind_supplier", (req, res) -> {
            res.type("application/json");
            try {
                JsonNode n = JSON.readTree(req.body());
                int supplierId = n.path("supplier_id").asInt();
                boolean ok = smsc.unbindSupplier(supplierId);
                return "{\"ok\":" + ok + ",\"supplier_id\":" + supplierId + "}";
            } catch (Exception e) {
                log.warn("[API] /unbind_supplier error", e);
                res.status(500);
                return "{\"ok\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        });

        // Forward submit_sm through the SMSC
        post("/submit_sm", (req, res) -> {
            res.type("application/json");
            try {
                JsonNode n = JSON.readTree(req.body());
                int supplierId = n.path("supplier_id").asInt();
                int clientId   = n.path("client_id").asInt();
                String clientCode = n.path("client_code").asText();
                String supplierCode = n.path("supplier_code").asText();
                String sourceAddr  = n.path("sender_id").asText();
                String destination = n.path("destination").asText();
                String text        = n.path("message").asText();
                String messageId   = n.path("message_id").asText();
                String smppMsgId   = smsc.submitSm(supplierId, clientId, clientCode, supplierCode,
                                                  sourceAddr, destination, text, messageId);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", true);
                out.put("smpp_message_id", smppMsgId);
                return JSON.writeValueAsString(out);
            } catch (Exception e) {
                log.warn("[API] /submit_sm error", e);
                res.status(500);
                return "{\"ok\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        });

        // Node-driven DLR (e.g. webhook) — route through DlrRouter
        post("/dlr_event", (req, res) -> {
            res.type("application/json");
            try {
                JsonNode n = JSON.readTree(req.body());
                String messageId    = n.path("message_id").asText();
                String smppMsgId    = n.path("smpp_message_id").asText();
                String dlrStatus    = n.path("dlr_status").asText("DELIVRD");
                String errorCode    = n.path("error_code").asText("000");
                String destination  = n.path("destination").asText();
                int clientId        = n.path("client_id").asInt(0);
                int supplierId      = n.path("supplier_id").asInt(0);
                String clientCode   = n.path("client_code").asText("");
                String supplierCode = n.path("supplier_code").asText("");

                String sourceAddr   = n.path("source_addr").asText("");

                smsc.dlrRouter().handleDlr(new DlrRouter.DlrPayload(
                    messageId, smppMsgId, clientId, supplierId,
                    clientCode, supplierCode, destination, sourceAddr, dlrStatus, errorCode,
                    System.currentTimeMillis()));
                return "{\"ok\":true}";
            } catch (Exception e) {
                log.warn("[API] /dlr_event error", e);
                res.status(500);
                return "{\"ok\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        });

        // Force-disconnect an ESME session by smpp_session_id — used by ops to
        // evict zombie sessions without restart.
        post("/api/esme/disconnect/:id", (req, res) -> {
            res.type("application/json");
            try {
                String sid = req.params(":id");
                GatewayState.EsmeSession s = state.esmeSessions.remove(sid);
                if (s != null) {
                    try { if (s.session() != null) s.session().unbindAndClose(); } catch (Exception ignored) {}
                    BackendProxy.notifyBindEvent(s.entityType(), s.entityId(), s.entityCode(),
                        s.systemId(), s.remoteIp(), s.bindMode(), sid, "unbound", 0);
                    return "{\"ok\":true,\"smpp_session_id\":\"" + sid + "\"}";
                }
                res.status(404);
                return "{\"ok\":false,\"error\":\"unknown session\"}";
            } catch (Exception e) {
                log.warn("[API] /api/esme/disconnect error", e);
                res.status(500);
                return "{\"ok\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        });
    }

    /** Map supplier.smpp_version string ('auto' | '3.3' | '3.4' | '5.0') to a byte.
     *  Returns 0 for 'auto' (meaning "negotiate best version") and the SMPP
     *  interface_version byte for explicit versions. */
    private static byte smppInterfaceVersionFrom(int rawOrZero) {
        // 0 means "auto" — caller (bind_supplier endpoint) will use
        // bindSupplierAuto() to negotiate v5.0 → v3.4 → v3.3.
        if (rawOrZero == 0) return 0;
        return (byte) (rawOrZero & 0xff);
    }

    private static BindType parseBindType(String s) {
        if ("tx".equalsIgnoreCase(s)) return BindType.BIND_TX;
        if ("rx".equalsIgnoreCase(s)) return BindType.BIND_RX;
        return BindType.BIND_TRX;
    }

    private static TypeOfNumber parseTon(int v) {
        switch (v) {
            case 1: return TypeOfNumber.INTERNATIONAL;
            case 2: return TypeOfNumber.NETWORK_SPECIFIC;
            case 5: return TypeOfNumber.ALPHANUMERIC;
            default: return TypeOfNumber.UNKNOWN;
        }
    }

    private static NumberingPlanIndicator parseNpi(int v) {
        switch (v) {
            case 1: return NumberingPlanIndicator.ISDN;
            default: return NumberingPlanIndicator.UNKNOWN;
        }
    }
}
