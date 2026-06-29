package com.net2app.smppgw;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Thin HTTP client from the Java gateway back to the Node.js backend
 * (control plane + db). Centralises base URL + internal token.
 *
 * Failures from the Node backend NEVER crash the gateway — we log and
 * return a sensible default so the SMS flow degrades gracefully.
 *
 * Java 21: HttpClient wired with virtual-thread executor so every outbound
 * request runs on a fresh virtual thread — no platform-thread pinning.
 */
public class BackendProxy {
    private static final Logger log = LoggerFactory.getLogger(BackendProxy.class);
    private static final String BASE = System.getenv().getOrDefault("BACKEND_BASE", "http://localhost:3000");
    private static final String TOKEN = System.getenv().getOrDefault("BACKEND_INTERNAL_TOKEN", "");
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final HttpClient http = HttpClient.newBuilder()
            .executor(Executors.newVirtualThreadPerTaskExecutor())
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * Asynchronously POST a JSON payload to a backend path (or absolute URL).
     * Returns a CompletableFuture<String> with the response body, or null on
     * any connection / timeout / non-2xx failure. Never throws.
     */
    public static CompletableFuture<String> postJsonAsync(String path, Map<String, Object> payload) {
        try {
            String body = JSON.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(path.startsWith("http") ? path : BASE + path))
                .header("Content-Type", "application/json")
                .header("X-Internal-Token", TOKEN)
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
            return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                       .thenApply(HttpResponse::body)
                       .exceptionally(e -> {
                           log.warn("[BackendProxy] {} failed: {}", path, e.getMessage());
                           return null;
                       });
        } catch (Exception e) {
            log.error("[BackendProxy] request build failed", e);
            return CompletableFuture.completedFuture(null);
        }
    }

    /** Authenticate system_id + password against clients OR inbound-suppliers table.
     *  @param remoteIp the actual IP of the connecting ESME client (for IP enforcement) */
    public static EsmcServer.AuthResult authenticateClient(String systemId, String password, String remoteIp) {
        String resp = postJsonAsync("/internal/esme_auth",
            Map.of("system_id", systemId, "password", password, "remote_ip", remoteIp != null ? remoteIp : "")).join();
        if (resp == null) return new EsmcServer.AuthResult(false, "backend unreachable", "client", 0, null);
        try {
            JsonNode n = JSON.readTree(resp);
            if (!n.path("ok").asBoolean(false))
                return new EsmcServer.AuthResult(false, n.path("reason").asText("denied"), "client", 0, null);
            return new EsmcServer.AuthResult(true, null,
                n.path("entity_type").asText("client"),
                n.path("entity_id").asInt(),
                n.path("entity_code").asText());
        } catch (Exception e) {
            return new EsmcServer.AuthResult(false, "parse error: " + e.getMessage(), "client", 0, null);
        }
    }

    public static void notifyBindEvent(String entityType, int entityId, String entityCode,
                                       String systemId, String remoteIp, String bindMode,
                                       String smppSessionId, String status, int interfaceVersion) {
        postJsonAsync("/internal/esme_bind_event", Map.of(
            "entity_type", entityType == null ? "client" : entityType,
            "entity_id", entityId,
            "entity_code", entityCode == null ? "" : entityCode,
            "system_id", systemId == null ? "" : systemId,
            "remote_ip", remoteIp == null ? "" : remoteIp,
            "bind_mode", bindMode == null ? "" : bindMode,
            "smpp_session_id", smppSessionId == null ? "" : smppSessionId,
            "status", status == null ? "" : status,
            "interface_version", interfaceVersion));
    }

    public static void notifyDlr(String messageId, String smppMessageId, String dlrStatus,
                                   String errorCode, String destination,
                                   int clientId, int supplierId) {
        postJsonAsync("/internal/dlr_event", Map.of(
            "message_id", messageId == null ? "" : messageId,
            "smpp_message_id", smppMessageId == null ? "" : smppMessageId,
            "dlr_status", dlrStatus == null ? "" : dlrStatus,
            "error_code", errorCode == null ? "" : errorCode,
            "destination", destination == null ? "" : destination,
            "client_id", clientId,
            "supplier_id", supplierId));
    }

    public static DlrRouter.PushTarget lookupClientDelivery(int clientId) {
        String resp = postJsonAsync("/internal/esme_delivery_lookup",
            Map.of("client_id", clientId)).join();
        if (resp == null) return null;
        try {
            JsonNode n = JSON.readTree(resp);
            return new DlrRouter.PushTarget(
                n.path("webhook_url").asText(null),
                n.path("esme_smpp_session_id").asText(null));
        } catch (Exception e) {
            log.warn("[BackendProxy] delivery lookup failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Resolve routing for an inbound ESMC submit_sm by consulting the
     * backend's route_maps. Passes client_id + destination (MCC prefix).
     * Returns {supplier_id, supplier_code, connection_type, route_id,
     * route_name, client_code} or null if no match.
     */
    public static JsonNode fetchRouteForDestination(int clientId, String destination, String clientCode) {
        try {
            String body = JSON.writeValueAsString(Map.of(
                "client_id", clientId,
                "destination", destination,
                "client_code", clientCode == null ? "" : clientCode));
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE + "/internal/esme_route_lookup"))
                .header("Content-Type", "application/json")
                .header("X-Internal-Token", TOKEN)
                .timeout(Duration.ofSeconds(5))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
            var resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("[BackendProxy] route lookup -> HTTP {}", resp.statusCode());
                return null;
            }
            JsonNode n = JSON.readTree(resp.body());
            if (!n.path("ok").asBoolean(false)) return null;
            return n.path("supplier");
        } catch (Exception e) {
            log.warn("[BackendProxy] route lookup failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Fetch the list of active outbound SMPP suppliers from the Node backend.
     * Called on gateway startup to auto-bind all known suppliers.
     * Returns an array of supplier records or empty array on failure.
     */
    public static JsonNode fetchActiveOutboundSuppliers() {
        try {
            String body = JSON.writeValueAsString(Map.of());
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE + "/internal/suppliers/active_outbound"))
                .header("Content-Type", "application/json")
                .header("X-Internal-Token", TOKEN)
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
            var resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("[BackendProxy] fetch active suppliers -> HTTP {}", resp.statusCode());
                return null;
            }
            JsonNode n = JSON.readTree(resp.body());
            return n.path("suppliers");
        } catch (Exception e) {
            log.warn("[BackendProxy] fetch active suppliers failed: {}", e.getMessage());
            return null;
        }
    }
}
