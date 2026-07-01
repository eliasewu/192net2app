// gateway-bridge.cjs
// =================================================================
// Thin Node.js HTTP client for the Java 21 SMPP Gateway control plane.
// The Java gateway listens on http://localhost:8081 (override via
// JAVA_GATEWAY_URL env) and exposes:
//   GET  /health             -> {ok: true}
//   POST /bind_supplier      -> {ok, supplier_id}      outbound SMSC bind
//   POST /unbind_supplier    -> {ok, supplier_id}      tear down SMSC bind
//   POST /submit_sm          -> {ok, smpp_message_id}  forward through SMSC
//   POST /dlr_event          -> {ok}                  (rare; Node mostly drives)
//
// Every method returns null on backend-unreachable so server.cjs can
// transparently fall back to the in-process simulation path used
// during dev. We do NOT throw from this module.
// =================================================================

const BASE = process.env.JAVA_GATEWAY_URL || 'http://localhost:8081';
const TIMEOUT_MS = parseInt(process.env.JAVA_GATEWAY_TIMEOUT_MS || '3000', 10);

async function postJson(path, payload, timeoutMs = TIMEOUT_MS) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      console.warn(`[bridge] ${path} -> HTTP ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.warn(`[bridge] ${path} -> ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return null;
  }
}

async function getJson(path) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(BASE + path, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

module.exports = {
  base: BASE,

  // Return true if the Java gateway is reachable and healthy.
  // Used at server.cjs boot to decide whether to log an info message
  // ("Java SMPP gateway reachable") vs keep silent.
  async health() {
    return await getJson('/health');
  },

  // Open an SMSC bind to a supplier
  // payload: {supplier_id, smpp_host, smpp_port, smpp_username, smpp_password,
  //           interface_version?: number}
  //   - interface_version is the SMPP bind PDU's version byte (0x33, 0x34,
  //     0x50 for v3.3/v3.4/v5.0). Java's gateway honors it when supported; if
  //     absent or null, Java picks a sensible default (typically the highest
  //     the SMSC accepts). Map from the supplier.smpp_version string ('auto'
  //     | '3.3' | '3.4' | '5.0') is done by the caller (server.cjs).
  async bindSupplier(payload) {
    return await postJson('/bind_supplier', payload);
  },

  // Long-timeout variant for auto-negotiation binds (v5.0 → v3.4 → v3.3).
  // Each version attempt has its own 5s SMPP timeout plus a 500ms interlude,
  // so worst-case is ~17s. We budget 20s to absorb one extra TCP retransmit.
  async bindSupplierLongTimeout(payload) {
    return await postJson('/bind_supplier', payload, 20000);
  },

  async unbindSupplier(supplier_id) {
    return await postJson('/unbind_supplier', { supplier_id });
  },

  // Force-disconnect an ESME client or inbound-supplier session by
  // smpp_session_id. Calls Java's POST /api/esme/disconnect/:id which
  // removes the session, closes the TCP socket, and fires a bind_event
  // (unbound) back to Node so smpp_sessions + suppliers tables stay in sync.
  // Returns null on gateway-unreachable; NEVER throws.
  async disconnectEsme(smppSessionId) {
    return await postJson(`/api/esme/disconnect/${encodeURIComponent(smppSessionId)}`, {});
  },

  // Forward an SMS through the SMSC
  // payload: {supplier_id, client_id, client_code, supplier_code, sender_id, destination, message, message_id}
  async submitSm(payload) {
    return await postJson('/submit_sm', payload);
  },

  // ----- Node → Java synthetic DLR push (voice OTP / webhook flows) -----
  // Forwards a DLR payload to Java's GatewayApi POST /dlr_event, which
  // hands it to DlrRouter.handleDlr() — that resolves into either:
  //   - a webhook POST to clients.webhook_url, OR
  //   - a synthesised ESMC deliver_sm PDU on the bound ESME session
  //     (currently a log-only stub in DlrRouter; the wire path is gated
  //     on the SMPP deliver_sm impl landing).
  //
  // payload: {message_id, smpp_message_id?, dlr_status, error_code?,
  //           destination, client_id, supplier_id?}
  //
  // Returns `{ok:true, route:webhook|esme|no_target|unhandled}` on success
  // or `{ok:false, route:'java_unreachable'}` when the bridge is offline.
  // NEVER throws — server.cjs poller must keep ticking even when Java
  // is down, and Node's own sms_logs row keeps the audit trail intact.
  async pushDlr(payload) {
    const r = await postJson('/dlr_event', payload || {});
    if (!r) return { ok: false, route: 'java_unreachable' };
    return Object.assign({ ok: true }, r);
  },
};
