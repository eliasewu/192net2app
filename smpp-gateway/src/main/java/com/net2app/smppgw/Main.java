package com.net2app.smppgw;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static spark.Spark.*;

/**
 * NET2APP SMPP Gateway - Java 21 entry point.
 * - ESMC role: listens on a TCP port (default 2775) and accepts inbound binds
 *   from external SMS clients (ESMEs). Authenticates them against the
 *   `clients` table in Postgres via the Node.js control plane.
 * - SMSC role: maintains outbound SMPP sessions to upstream suppliers.
 *   On a successful submit_sm PDU, the gateway waits for delivery_sm and
 *   routes it back to the originating client (HTTP webhook OR SMPP
 *   delivery_sm back over the wire).
 * - REST control plane (Spark Java, port 8081).
 *
 * Java 21 idioms: virtual threads via SmscManager + EsmcServer self-allocated
 * Executors.newVirtualThreadPerTaskExecutor; StructuredTaskScope in DlrRouter;
 * records in GatewayState. Add JVM flags -Djdk.tracePinnedThreads=full when
 * diagnosing thread-pin warnings.
 */
public class Main {
    private static final Logger log = LoggerFactory.getLogger(Main.class);

    /** Parse an int env var with a fallback default; never throws. */
    private static int envInt(String key, int fallback) {
        try {
            int val = Integer.parseInt(System.getenv().getOrDefault(key, String.valueOf(fallback)));
            return val > 0 ? val : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** Parse a long env var with a fallback default; never throws. */
    private static long envLong(String key, long fallback) {
        try {
            long val = Long.parseLong(System.getenv().getOrDefault(key, String.valueOf(fallback)));
            return val >= 0 ? val : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public static void main(String[] args) {
        log.info("==========================================================");
        log.info("NET2APP SMPP Gateway (Java {} + jSMPP)", Runtime.version());
        log.info("==========================================================");

        String bindHost = System.getenv().getOrDefault("ESMC_HOST", "0.0.0.0");
        int bindPort = Integer.parseInt(System.getenv().getOrDefault("ESMC_PORT", "2775"));
        int httpPort = Integer.parseInt(System.getenv().getOrDefault("CTRL_PORT", "8081"));

        port(httpPort);
        ipAddress("0.0.0.0");

        GatewayState state = new GatewayState();
        SmscManager smsc = new SmscManager(state);
        EsmcServer esmc = new EsmcServer(state, smsc);

        // Graceful drain on any exit signal: send unbind to suppliers, tear down
        // ESME sessions, then stop the Spark HTTP server. Each component's close()
        // is idempotent so a double-invocation (Ctrl-C then JVM exit) is safe.
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("[Gateway] Shutdown signal received — draining binds");
            try { esmc.stop(); } catch (Exception e) { log.warn("esmc.stop failed", e); }
            try { smsc.shutdown(); } catch (Exception e) { log.warn("smsc.shutdown failed", e); }
            try { stop(); } catch (Exception e) { log.warn("spark.stop failed", e); }
            log.info("[Gateway] Shutdown complete");
        }, "smpp-gateway-shutdown"));

        esmc.start(bindHost, bindPort);
        new GatewayApi(state, smsc).register();

        // Auto-bind all active outbound suppliers on startup.
        // Query the Node backend for the supplier list, then bind each one.
        // This runs async so the gateway is responsive immediately.
        Thread.ofVirtual().name("startup-auto-bind").start(() -> {
            try {
                int maxRetries = envInt("AUTO_BIND_RETRIES", 3);
                long backoffMs = envLong("AUTO_BIND_BACKOFF_MS", 3000);
                // Small delay to let the HTTP server come up fully
                Thread.sleep(1000);
                var suppliers = BackendProxy.fetchActiveOutboundSuppliers();
                if (suppliers == null || !suppliers.isArray()) {
                    log.info("[Gateway] No suppliers to auto-bind (backend returned null or non-array)");
                    return;
                }
                log.info("[Gateway] Auto-binding {} supplier(s) on startup...", suppliers.size());
                for (var node : suppliers) {
                    int sid = node.path("supplier_id").asInt(0);
                    if (sid <= 0) continue;
                    String host = node.path("host").asText();
                    int port = node.path("port").asInt(2775);
                    String sysId = node.path("system_id").asText();
                    String pass = node.path("password").asText();
                    String sysType = node.path("system_type").asText("");
                    String smppVer = node.path("smpp_version").asText("auto");
                    String bindTypeStr = node.path("bind_type").asText("trx");
                    int addrTonInt = node.path("addr_ton").asInt(0);
                    int addrNpiInt = node.path("addr_npi").asInt(0);
                    String addrRangeStr = node.path("addr_range").asText("system_id");

                    byte ifaceVer = 0;
                    switch (smppVer) {
                        case "3.3": ifaceVer = (byte)0x33; break;
                        case "3.4": ifaceVer = (byte)0x34; break;
                        case "5.0": ifaceVer = (byte)0x50; break;
                        default:    ifaceVer = 0; break; // auto
                    }

                    boolean ok = false;
                    byte negotiated = 0;

                    // Resolve bind params
                    org.jsmpp.bean.BindType bindType = org.jsmpp.bean.BindType.BIND_TRX;
                    if ("tx".equalsIgnoreCase(bindTypeStr)) bindType = org.jsmpp.bean.BindType.BIND_TX;
                    else if ("rx".equalsIgnoreCase(bindTypeStr)) bindType = org.jsmpp.bean.BindType.BIND_RX;

                    org.jsmpp.bean.TypeOfNumber addrTon = org.jsmpp.bean.TypeOfNumber.UNKNOWN;
                    switch (addrTonInt) {
                        case 1: addrTon = org.jsmpp.bean.TypeOfNumber.INTERNATIONAL; break;
                        case 2: addrTon = org.jsmpp.bean.TypeOfNumber.NETWORK_SPECIFIC; break;
                        case 5: addrTon = org.jsmpp.bean.TypeOfNumber.ALPHANUMERIC; break;
                    }

                    org.jsmpp.bean.NumberingPlanIndicator addrNpi = org.jsmpp.bean.NumberingPlanIndicator.UNKNOWN;
                    if (addrNpiInt == 1) addrNpi = org.jsmpp.bean.NumberingPlanIndicator.ISDN;

                    for (int attempt = 1; attempt <= maxRetries; attempt++) {
                        if (ifaceVer == 0) {
                            negotiated = smsc.bindSupplierAuto(sid, host, port, sysId, pass, sysType,
                                bindType, addrTon, addrNpi, addrRangeStr);
                            ok = negotiated != 0;
                        } else {
                            ok = smsc.bindSupplier(sid, host, port, sysId, pass, sysType,
                                bindType, addrTon, addrNpi, addrRangeStr, ifaceVer);
                            negotiated = ok ? ifaceVer : 0;
                        }
                        if (ok) break;
                        if (attempt < maxRetries) {
                            log.debug("[Gateway] Auto-bind retry {}/{} for supplier {} in {}ms...",
                                     attempt + 1, maxRetries, sid, backoffMs);
                            try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                        }
                    }

                    if (ok) {
                        log.info("[Gateway] Auto-bind OK: supplier {} ({}) bound @ 0x{}",
                                 sid, sysId, String.format("%02X", negotiated & 0xff));
                    } else {
                        log.warn("[Gateway] Auto-bind FAIL: supplier {} ({})", sid, sysId);
                    }
                }
                log.info("[Gateway] Startup auto-bind phase complete");
            } catch (Exception e) {
                log.warn("[Gateway] startup auto-bind failed (non-fatal): {}", e.getMessage());
            }
        });

        log.info("[Gateway] All components online. ESMC=tcp://{}:{} CTRL=http://0.0.0.0:{}", bindHost, bindPort, httpPort);
    }
}
