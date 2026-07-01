// =================================================================
// asterisk-bridge.cjs — multi-server failover Asterisk bridge
//
// One persistent AMI socket per registered `sip_servers` row. Each
// server keeps its own _pendingCallsByServer<serverId, call_id>
// await-map so a DialEnd / Hangup event matching var NET2APP_CALL_ID
// resolves only the Promise belonging to THAT server — keeps
// failover races deterministic when the same call_id could in
// principle bounce between two Asterisk hosts.
//
// Backwards-compat: loadSettings / updateSettings / regenerateConfig
// still serve the legacy `asterisk_settings` single-row shape, so
// existing /api/asterisk/* + AsteriskConfig.tsx keep working without
// a migration. On boot the new `loadServers()` reads sip_servers;
// if the legacy row exists but sip_servers is empty, it synthesizes
// one row carrying the legacy values so a single-server deployment
// upgrades transparently.
// =================================================================
const net = require('net');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Pre-require the Java control-plane bridge so apiExtensions.cjs can
// proxy synthetic-DLR pushes via _astBridge.gatewayPushDlr() without
// importing gateway-bridge.cjs itself. server.cjs already requires
// gateway-bridge directly — that handle stays primary.
const gwBridge = require('./gateway-bridge.cjs');

// ---------------- state ----------------
let _pool = null;
function setPool(p) { _pool = p; }

// Multi-server registries keyed by sip_servers.id.
const _servers = new Map();              // id -> row (full DB row, plus last_health fields)
const _listenersByServer = new Map();    // id -> { sock, buf, loggedIn, channelCallDb, reconnectTimer } | null
const _pendingCallsByServer = new Map(); // id -> Map(call_id -> { resolve, timer })

// Per-destination regex routing. One entry per sip_server_destinations row;
// pattern is compiled once at load time. nil _destinations means the
// feature is not in use => pickServerForDestination() short-circuits to
// pickServer(fallbackStrategy).
const _destinations = new Map();         // id -> { row data + compiled: RegExp }

// Callback subscribers (legacy single-Set shape so existing subscribes
// keep receiving ALL events from ALL servers, tagged with serverId).
const _servListeners = new Set();

let _rrIndex = 0;

// ---------------- bootstrap & legacy migration ----------------
async function loadServers() {
  if (!_pool) return _servers;
  try {
    // Backwards-compat: if sip_servers is empty but asterisk_settings has
    // a legacy row, synthesize one sip_servers row from it.
    const cnt = await _pool.query('SELECT COUNT(*) FROM sip_servers');
    if (parseInt(cnt.rows[0].count, 10) === 0) {
      const legacy = await _pool.query(
        'SELECT * FROM asterisk_settings ORDER BY id DESC LIMIT 1'
      );
      if (legacy.rows.length) {
        const L = legacy.rows[0];
        await _pool.query(
          `INSERT INTO sip_servers
             (name, ami_host, sip_host, ami_port, sip_port,
              ami_username, ami_secret, transport, dialplan_context,
              priority, is_active, notes)
           VALUES ('legacy-imported', $1, $2, $3, $4, $5, $6, 'udp', $7, 10, true,
                   'migrated from asterisk_settings on boot')
           ON CONFLICT (ami_host, ami_port) DO NOTHING`,
          [L.ami_host, L.sip_host, L.ami_port, L.sip_port,
           L.ami_username, L.ami_secret, L.dialplan_context || 'net2app-otp']
        );
      }
    }

    const r = await _pool.query(
      'SELECT * FROM sip_servers WHERE is_active = true ORDER BY priority ASC, id ASC'
    );
    // Tear down listeners + pending maps for any server that has been
    // archived or removed since the last load. Without this, a deleted
    // sip_servers row would leave its AMI socket reconnecting every 5s
    // forever, and any inflight await promises held against that id would
    // never resolve (timeout only). Detach BEFORE refilling _servers so
    // removed rows don't survive the reload.
    // Also clear _listenerEvents ring + destinations cache for the id
    // (reviewer issue C — fleet churn would otherwise leak ring buffers).
    const liveIds = new Set(r.rows.map((row) => row.id));
    for (const [id, st] of _listenersByServer.entries()) {
      if (liveIds.has(id)) continue;
      try { if (st && st.sock && !st.sock.destroyed) st.sock.end(); } catch (_) {}
      if (st && st.reconnectTimer) clearTimeout(st.reconnectTimer);
      _listenersByServer.delete(id);
      _pendingCallsByServer.delete(id);
      if (typeof _listenerEvents !== 'undefined' && _listenerEvents && _listenerEvents.delete) _listenerEvents.delete(id);
    }
    _servers.clear();
    r.rows.forEach((row) => {
      _servers.set(row.id, row);
      if (!_pendingCallsByServer.has(row.id)) _pendingCallsByServer.set(row.id, new Map());
      if (!_listenersByServer.has(row.id)) _listenersByServer.set(row.id, null);
    });
  } catch (e) {
    console.warn('[asterisk] loadServers failed (non-fatal):', e.message);
  }
  return _servers;
}

async function reloadServersAndRestart() {
  await loadServers();
  await loadDestinations();
  await startAllAMIListeners();
}

// ---------------- destination-pattern helpers ----------------
function normalizeDestination(e164) {
  const digits = String(e164 || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return '+' + digits.slice(1).replace(/\+/g, '');
  return '+' + digits;
}

// Cap pattern length so an admin pasting a runaway regex (DoS) cannot
// crash the call router. 256 is large enough for any sane E.164 allow/
// deny shape and small enough to bound compile work.
const MAX_PATTERN_LEN = 256;

function compilePatternSafe(patternStr) {
  const s = String(patternStr || '');
  if (s.length > MAX_PATTERN_LEN) {
    return { ok: false, error: `pattern too long (${s.length} > ${MAX_PATTERN_LEN})` };
  }
  try { return { ok: true, regex: new RegExp(s) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function loadDestinations() {
  if (!_pool) return _destinations;
  try {
    const r = await _pool.query(
      'SELECT * FROM sip_server_destinations WHERE is_active=true ORDER BY priority ASC, id ASC'
    );
    _destinations.clear();
    r.rows.forEach((row) => {
      const cp = compilePatternSafe(row.pattern);
      // Drop rules whose regex fails to compile — they would silently
      // never match. The admin gets the same error message back from
      // the API endpoint that inserted them.
      if (cp.ok) _destinations.set(row.id, { ...row, compiled: cp.regex });
    });
  } catch (e) {
    console.warn('[asterisk] loadDestinations failed (non-fatal):', e.message);
  }
  return _destinations;
}

async function reloadDestinationsAndRestart() {
  await loadDestinations();
}

// pickServerForDestination(destination, fallbackStrategy='priority', excludeId=null)
//
// 1. normalize the destination to E.164 form so tests are consistent.
// 2. If no destination rules are configured, defer to pickServer(fallback, excludeId).
// 3. Iterate rules in (priority ASC, id ASC) order. For each rule:
//    - skip rules whose sip_server_id is no longer in the live _servers map
//      (archived / removed).
//    - if the regex matches and kind='allow'  -> return the matched server
//      unless it's the excluded one (e.g. the row was just retrying break).
//    - if the regex matches and kind='deny'   -> short-circuit to
//      pickServer(fallbackStrategy, rule.sip_server_id) so the denied host
//      is excluded from the priority fallback, but other rules / later
//      priority sort can still pick a healthy server.
// 4. If no allow rule matched, fall back to pickServer(fallback, excludeId).
// A server is "callable" if it has a DB row AND its persistent AMI listener
// is logged in. Without this gate, the pickers will happily return a server
// whose socket is in 'reconnecting' state — `originate()` on it queues a
// Promise into `_pendingCallsByServer.get(id)`, but no DialEnd event arrives
// (the AMI link is down), so the call sits for the full 60s timeout.
function isServerCallable(id) {
  if (!_servers.has(id)) return false;
  const st = _listenersByServer.get(id);
  return !!(st && st.sock && !st.sock.destroyed && st.loggedIn);
}

function pickServer(strategy = 'priority', excludeId = null) {
  const all = Array.from(_servers.values());
  const candidates = all.filter((s) =>
    (excludeId == null ? true : s.id !== excludeId) && isServerCallable(s.id)
  );
  if (!candidates.length) return null;
  if (strategy === 'round_robin') {
    const idx = _rrIndex % candidates.length;
    _rrIndex = (_rrIndex + 1) % candidates.length;
    return candidates[idx];
  }
  // Default: priority ASC (lower number = higher priority), tie-break by id.
  return candidates.sort((a, b) => (a.priority - b.priority) || (a.id - b.id))[0];
}

function pickServerForDestination(destination, fallbackStrategy = 'priority', excludeId = null) {
  const normalized = normalizeDestination(destination);
  if (!_destinations.size) return pickServer(fallbackStrategy, excludeId);
  const rules = Array.from(_destinations.values())
    .filter((r) => _servers.has(r.sip_server_id))
    .sort((a, b) => (a.priority - b.priority) || (a.id - b.id));
  for (const rule of rules) {
    let matched = false;
    try { matched = rule.compiled.test(normalized); } catch (_) { continue; }
    if (!matched) continue;
    if (rule.kind === 'deny') {
      // Deny: don't return the denied server; let next rule or fallback pick.
      return pickServer(fallbackStrategy, rule.sip_server_id);
    }
    // kind === 'allow'
    const srv = _servers.get(rule.sip_server_id);
    if (srv && srv.id !== excludeId && isServerCallable(srv.id)) return srv;
  }
  return pickServer(fallbackStrategy, excludeId);
}

// ---------------- per-server AMI listener ----------------
function startServerAMIListener(serverId) {
  if (process.env.ASTERISK_ENABLED !== 'true') {
    console.log('[asterisk] ASTERISK_ENABLED is not "true" — skipping AMI listener');
    return;
  }
  let state = _listenersByServer.get(serverId);
  if (state && state.sock && !state.sock.destroyed) return;
  const server = _servers.get(serverId);
  if (!server) {
    console.warn(`[asterisk] startServerAMIListener skipped: server id ${serverId} not in map`);
    return;
  }
  const sock = net.connect({ host: server.ami_host, port: server.ami_port });
  state = {
    serverId,
    server,
    sock,
    buf: '',
    loggedIn: false,
    channelCallDb: {},
    reconnectTimer: null,
  };
  _listenersByServer.set(serverId, state);

  sock.on('connect', () => {
    sock.write(`Action: Login\r\nUsername: ${server.ami_username}\r\nSecret: ${server.ami_secret}\r\n\r\n`);
  });
  sock.on('data', (chunk) => {
    state.buf += chunk.toString();
    let idx;
    while ((idx = state.buf.indexOf('\r\n\r\n')) !== -1) {
      const block = state.buf.substring(0, idx);
      state.buf = state.buf.substring(idx + 4);
      const evt = {};
      block.split('\r\n').forEach((line) => {
        const sep = line.indexOf(':');
        if (sep > -1) evt[line.substring(0, sep).trim()] = line.substring(sep + 1).trim();
      });
      if (!state.loggedIn && evt.Response && /Success/.test(evt.Response)) {
        state.loggedIn = true;
        const events = ['Newchannel', 'DialBegin', 'DialEnd', 'Hangup', 'VarSet', 'PeerStatus', 'BridgeEnter'];
        sock.write(`Action: Events\r\nEventMask: ${events.join(',')}\r\n\r\n`);
      }
      if (!evt.Event) continue;
      // Tag call_id via VarSet NET2APP_CALL_ID.
      if (evt.Event === 'VarSet' && (evt.Variable === 'NET2APP_CALL_ID' || evt.Variable === 'net2app_call_id')) {
        state.channelCallDb[evt.Channel] = evt.Value;
      }
      if (state.channelCallDb[evt.Channel]) evt.call_id = state.channelCallDb[evt.Channel];
      // Push a compact event summary into the per-server ring buffer so the
      // UI's listener-badge feature can render "last 5 events" without
      // reconnecting just to look at one.
      try {
        pushListenerEvent(serverId, {
          ts: new Date().toISOString(),
          event: evt.Event,
          call_id: evt.call_id || null,
          extra: ['DialBegin','DialEnd','Hangup','Newchannel','PeerStatus','VarSet'].includes(evt.Event)
            ? { channel: evt.Channel || null, dialstatus: evt.DialStatus || null, cause: evt.Cause || null }
            : null,
        });
      } catch (_) {}
      // Fulfill the per-server await Promise on lifecycle events.
      if (evt.call_id) {
        const pendingMap = _pendingCallsByServer.get(serverId);
        if (pendingMap && pendingMap.has(evt.call_id)) {
          const p = pendingMap.get(evt.call_id);
          if (evt.Event === 'DialEnd') {
            const answered = evt.DialStatus === 'ANSWERED' || /ANSWER/.test(evt.DialStatus || '');
            clearTimeout(p.timer);
            pendingMap.delete(evt.call_id);
            p.resolve(answered);
          } else if (evt.Event === 'Hangup') {
            const cause = parseInt(evt.Cause, 10);
            const success = cause === 16;
            clearTimeout(p.timer);
            pendingMap.delete(evt.call_id);
            p.resolve(success);
          }
        }
      }
      _servListeners.forEach((cb) => { try { cb(serverId, evt); } catch (_) {} });
    }
  });
  sock.on('error', (e) => {
    console.warn(`[asterisk] AMI socket error server #${serverId} (${server.ami_host}:${server.ami_port}):`, e.message);
  });
  sock.on('close', () => {
    state.sock = null;
    _listenersByServer.set(serverId, null);
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => startServerAMIListener(serverId), 5000);
  });
  console.log(`[asterisk] AMI listener started: server #${serverId} ${server.ami_host}:${server.ami_port} (priority ${server.priority})`);
}

async function startAllAMIListeners() {
  if (!_servers.size) await loadServers();
  for (const id of _servers.keys()) startServerAMIListener(id);
}

function awaitCallStatus(serverId, call_id, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let map = _pendingCallsByServer.get(serverId);
    if (!map) {
      map = new Map();
      _pendingCallsByServer.set(serverId, map);
    }
    const timer = setTimeout(() => {
      map.delete(call_id);
      resolve(false);
    }, timeoutMs);
    map.set(call_id, { resolve, timer });
  });
}

// ---------------- originate ----------------
function originate(serverIdOrOpts, paramsMaybe) {
  let serverId, params;
  if (typeof serverIdOrOpts === 'object' && serverIdOrOpts !== null) {
    serverId = pickServer('priority')?.id;
    params = serverIdOrOpts;
  } else {
    serverId = serverIdOrOpts;
    params = paramsMaybe || {};
  }
  const server = _servers.get(serverId);
  if (!server) return Promise.resolve(null);
  const vars = `OTP_LANG=${params.language || 'en-US'},OTP_CODE=${params.otp_code || ''},NET2APP_CALL_ID=${params.call_id || ''},NET2APP_AUDIO_FILES=${params.audio_files || ''}`;
  const headers = {
    Action: 'Originate',
    Channel: `Local/s@${server.dialplan_context || 'net2app-otp'}/n`,
    Context: server.dialplan_context || 'net2app-otp',
    Exten: String(params.destination || ''),
    Priority: '1',
    CallerID: params.caller_id || 'NET2APP',
    Variable: vars,
    Async: 'yes',
  };
  let body = '';
  Object.keys(headers).forEach((k) => { body += `${k}: ${headers[k]}\r\n`; });
  body += '\r\n';
  return new Promise((resolve) => {
    const sock = net.connect({ host: server.ami_host, port: server.ami_port, timeout: 1500 }, () => {});
    let buf = '', logged = false, sent = false;
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      if (!logged && /Asterisk Call Manager/.test(buf)) {
        logged = true;
        sock.write(`Action: Login\r\nUsername: ${server.ami_username}\r\nSecret: ${server.ami_secret}\r\n\r\n`);
      }
      if (logged && !sent) { sock.write(body); sent = true; }
    });
    sock.on('error', () => resolve(null));
    sock.on('timeout', () => resolve(null));
    setTimeout(() => { try { sock.end(); } catch (_) {} resolve({ ok: sent, server_id: serverId, raw: buf }); }, 2500);
  });
}

// ---------------- health probe ----------------
let _bridgeBootTime = Date.now(); // process-uptime anchor for LISTENER_STUCK tip

// One-shot TCP+AMI probe against a server, classified by failure mode so the
// tips engine has structured input rather than a boolean ok flag. Returns
// { ok, latency_ms, error, server_id } where `error` is one of:
//   - 'unknown_server_id' (caller asked for non-existent row)
//   - 'ECONNREFUSED' / 'ETIMEDOUT' / 'ENETUNREACH' (TCP-level failure)
//   - 'NO_HANDSHAKE' (port open but no Asterisk Call Manager banner)
//   - 'CONNECTION_DROPPED' (banner seen, then socket closed mid-login)
//   - 'AMI_AUTH_FAILED' (port open, banner seen, Response: Error)
//   - 'SOCKET_ERROR' (other socket-layer failure)
//   - null on success.
async function healthCheck(serverId) {
  const server = _servers.get(serverId);
  if (!server) return { ok: false, error: 'unknown_server_id', server_id: serverId };
  const start = Date.now();
  let ok = false, errorCode = null;
  try {
    ok = await new Promise((resolve) => {
      let handshakeSeen = false;
      const sock = net.connect({ host: server.ami_host, port: server.ami_port, timeout: 2500 }, () => {
        sock.write(`Action: Login\r\nUsername: ${server.ami_username}\r\nSecret: ${server.ami_secret}\r\n\r\n`);
      });
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString();
        if (/Asterisk Call Manager/.test(buf)) handshakeSeen = true;
        if (/Response:\s*Success/.test(buf)) { resolve(true); cleanup(); }
        else if (/Response:\s*Error/.test(buf)) { errorCode = 'AMI_AUTH_FAILED'; resolve(false); cleanup(); }
      };
      const cleanup = () => { try { sock.removeListener('data', onData); sock.destroy(); } catch (_) {} };
      sock.on('data', onData);
      sock.on('error', (e) => {
        if (!errorCode) errorCode = (e && e.code) ? String(e.code) : 'SOCKET_ERROR';
        resolve(false); cleanup();
      });
      sock.on('timeout', () => { if (!errorCode) errorCode = 'ETIMEDOUT'; resolve(false); cleanup(); });
      sock.on('close', () => {
        if (ok) return;
        if (!errorCode) errorCode = handshakeSeen ? 'CONNECTION_DROPPED' : 'NO_HANDSHAKE';
        resolve(false);
      });
      sock.setTimeout(2500);
    });
  } catch (e) {
    if (!errorCode) errorCode = (e && e.code) ? String(e.code) : (e && e.message) || 'EXCEPTION';
    ok = false;
  }
  const latency_ms = Date.now() - start;
  if (_pool) {
    try {
      await _pool.query(
        `UPDATE sip_servers SET last_health_status=$1, last_health_at=NOW(), last_health_latency_ms=$2, updated_at=NOW() WHERE id=$3`,
        [ok ? 'ok' : 'down', latency_ms, serverId]
      );
      server.last_health_status = ok ? 'ok' : 'down';
      server.last_health_latency_ms = latency_ms;
    } catch (_) {}
  }
  return { ok, latency_ms, error: errorCode, server_id: serverId };
}

// ---------------- diagnostic tips engine ----------------
// Each rule is a small (trigger, message, action, severity) tuple. Rules run
// in two passes: fleet-level (single-arg trigger) and per-server
// (state, server, result) trigger. Output is sorted by severity then
// de-duplicated by message so the UI doesn't spam. NEVER print password /
// secret material — we reference AMI username only.
const TIP_RULES = [
  { code: 'NO_SERVERS',           severity: 'critical', trigger: (st) => st.servers.size === 0,
    msg:   () => 'No active SIP servers found in sip_servers.',
    act:   () => 'Add via POST /api/asterisk/servers (name, ami_host, sip_host, ami_port, sip_port, ami_username, ami_secret). The §16 migration seeds 198.27.80.229 only when sip_servers is empty AND no legacy asterisk_settings row exists.' },
  { code: 'LEGACY_LOCALHOST_DRIFT', severity: 'high', trigger: (st, srv) =>
      srv.ami_host === '127.0.0.1' && st.legacy && st.legacy.asterisk_installed === false,
    msg: (srv) => `Server #${srv.id} '${srv.name}' is a legacy 127.0.0.1 row but no local Asterisk is installed.`,
    act:   (srv) => `Either install locally (POST /api/asterisk/install, then core reload) or update ami_host/sip_host to your remote IP (e.g. 198.27.80.229) via PUT /api/asterisk/servers/${srv.id}.` },
  { code: 'HOST_COLLISION',       severity: 'warning', trigger: (st, srv) => st.hostCounts[`${srv.ami_host}:${srv.ami_port}`] > 1,
    msg: (srv) => `Multiple active sip_servers share ${srv.ami_host}:${srv.ami_port}.`,
    act:   ()   => 'Archive duplicates via DELETE /api/asterisk/servers/:id — the UNIQUE(ami_host,ami_port) index protects but ghost rows can slip through after soft-delete if the index key was changed.' },
  { code: 'NEVER_PROBED',         severity: 'low', trigger: (st, srv) => srv.last_health_status === 'unknown',
    msg: (srv) => `Server #${srv.id} '${srv.name}' has never been probed yet (last_health_status=unknown).`,
    act:   (srv) => `Run POST /api/asterisk/servers/${srv.id}/test to force a TCP+AMI handshake now.` },
  { code: 'ECONNREFUSED',         severity: 'critical', trigger: (st, srv, r) => !r.ok && r.error === 'ECONNREFUSED',
    msg: (srv, r) => `TCP connect to ${srv.ami_host}:${srv.ami_port} was refused (${r.latency_ms}ms — fast fail, port is closed).`,
    act:   (srv) => `On ${srv.ami_host} run \`ss -tlnp | grep ${srv.ami_port}\`. In /etc/asterisk/manager.conf ensure \`bindaddr = 0.0.0.0\` (NOT 127.0.0.1), then \`asterisk -rx 'manager reload'\`. Confirm no firewall drop on the way.` },
  { code: 'ETIMEDOUT',            severity: 'critical', trigger: (st, srv, r) => !r.ok && (r.error === 'ETIMEDOUT' || r.error === 'ENETUNREACH' || (r.latency_ms || 0) >= 2500),
    msg: (srv, r) => `Connection to ${srv.ami_host}:${srv.ami_port} timed out (${r.latency_ms}ms) — host unreachable.`,
    act:   (srv) => `Run \`ping -c3 ${srv.ami_host}\` from the Node host. If reachable but AMI still times out, check inbound firewall on ${srv.ami_host}: \`ufw status\` / \`iptables -L -n\` and \`ufw allow ${srv.ami_port}/tcp\`.` },
  { code: 'NO_HANDSHAKE',         severity: 'high', trigger: (st, srv, r) => !r.ok && r.error === 'NO_HANDSHAKE',
    msg: (srv) => `TCP connected to ${srv.ami_host}:${srv.ami_port} but no Asterisk Call Manager banner was received — wrong port, or service behind it isn't Asterisk AMI.`,
    act:   (srv) => `Confirm ${srv.ami_port} is the AMI port (NOT the SIP port 5060). Try \`nc -zv ${srv.ami_host} ${srv.ami_port}\` then \`telnet ${srv.ami_host} ${srv.ami_port}\` and look for "Asterisk Call Manager".` },
  { code: 'CONNECTION_DROPPED',   severity: 'high', trigger: (st, srv, r) => !r.ok && r.error === 'CONNECTION_DROPPED',
    msg: (srv) => `AMI banner appeared then socket closed before Response:Success/Error — manager.conf may be denying our credentials at the deny/permit line.`,
    act:   (srv) => `On ${srv.ami_host} edit /etc/asterisk/manager.conf under [${srv.ami_username}]: ensure \`permit=0.0.0.0/0.0.0.0\` (or restrict to this Node outbound IP), set \`read = system,call,originate,all\` and \`write = system,call,originate,all\`, then \`manager reload\`.` },
  { code: 'AMI_AUTH_FAILED',      severity: 'high', trigger: (st, srv, r) => !r.ok && r.error === 'AMI_AUTH_FAILED',
    msg: (srv) => `TCP connected, AMI banner received, but login was rejected for user '${srv.ami_username}'.`,
    act:   (srv) => `Verify /etc/asterisk/manager.conf has [${srv.ami_username}] with secret matching DB sip_servers.ami_secret for server #${srv.id}. Confirm \`permit\` covers this Node host.` },
  { code: 'LISTENER_STUCK',       severity: 'medium', trigger: (st, srv) => {
      const l = st.listeners.get(srv.id);
      return l && !l.loggedIn && l.reconnectTimer != null && (Date.now() - st.bootTime) > 5000;
    },
    msg: (srv) => `Persistent AMI listener for server #${srv.id} is in a reconnect loop (never logged in).`,
    act:   ()   => `Inspect Node stdout for "[asterisk] AMI socket error" lines. The bridge auto-retries every 5s — confirm network is stable and that the underlying issue matches the matching ECONNREFUSED/ETIMEDOUT/AMI_AUTH_FAILED tip above.` },
  { code: 'DEAD_LEGACY_CONFIG',   severity: 'medium', trigger: (st) => st.legacy && st.legacy.use_existing_config === false && st.legacy.asterisk_installed === false,
    msg: (st) => `asterisk_settings.use_existing_config=false but local asterisk is not installed — regenerateConfig() will refuse to write templates.`,
    act:   ()   => `Either run POST /api/asterisk/install or set use_existing_config=true and rely on your own dialplan files.` },
  { code: 'FLEET_NO_REACHABLE',   severity: 'critical', trigger: (st, srv, r) => {
      // After aggregating per-server tips, the caller can detect "all-down"
      // and emit this top-level tip.
      return false; // computed post-hoc
    },
    msg: () => `Zero reachable SIP servers: fpm/DLR routing will queue calls indefinitely.`,
    act:   ()   => `Add a healthy server (POST /api/asterisk/servers) or fix the worst-ranked critical tip first.` },
];

function buildTips(healthResults, legacySettings) {
  const state = {
    servers:   _servers,
    listeners: _listenersByServer,
    legacy:    legacySettings || {},
    bootTime:  _bridgeBootTime,
    hostCounts: Array.from(_servers.values()).reduce((acc, s) => {
      const k = `${s.ami_host}:${s.ami_port}`;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
  const out = [];
  // Fleet-level pass (single-arg triggers).
  for (const r of TIP_RULES) {
    if (r.trigger.length === 1) {
      try { if (r.trigger(state)) out.push({ code: r.code, severity: r.severity, server_id: null, message: r.msg(), action: r.act() }); }
      catch (_) {}
    }
  }
  // Per-server pass.
  for (const srv of _servers.values()) {
    const res = (healthResults || []).find((hr) => hr.server_id === srv.id) || { ok: false, error: 'UNKNOWN', latency_ms: 0 };
    for (const r of TIP_RULES) {
      if (r.trigger.length > 1) {
        try { if (r.trigger(state, srv, res)) out.push({ code: r.code, severity: r.severity, server_id: srv.id, message: r.msg(srv, res), action: r.act(srv) }); }
        catch (_) {}
      }
    }
  }
  // Post-hoc fleet aggregation: if any per-server result existed AND every
  // one of them is down, surface FLEET_NO_REACHABLE.
  const real = (healthResults || []).filter((r) => r && r.error !== 'unknown_server_id');
  if (real.length && real.every((r) => !r.ok)) {
    out.push({ code: 'FLEET_NO_REACHABLE', severity: 'critical', server_id: null, message: TIP_RULES.find((r) => r.code === 'FLEET_NO_REACHABLE').msg(), action: TIP_RULES.find((r) => r.code === 'FLEET_NO_REACHABLE').act() });
  }
  // Dedupe by code+message; merge affected_servers.
  const seen = new Map();
  for (const t of out) {
    const key = `${t.code}::${t.message}`;
    if (!seen.has(key)) {
      seen.set(key, { code: t.code, severity: t.severity, message: t.message, action: t.action, affected_servers: t.server_id ? [t.server_id] : [] });
    } else if (t.server_id) {
      const e = seen.get(key);
      if (!e.affected_servers.includes(t.server_id)) e.affected_servers.push(t.server_id);
    }
  }
  const sevRank = { critical: 0, high: 1, medium: 2, warning: 3, low: 4 };
  return Array.from(seen.values()).sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || a.code.localeCompare(b.code));
}

async function healthCheckAll() {
  // Ensure the in-memory fleet matches PG (fresh-boot discovery): if DB
  // refreshed while server.cjs was up (config drift), pull latest.
  if (!_servers.size && _pool) {
    try { await loadServers(); } catch (_) {}
  }
  const results = [];
  for (const id of _servers.keys()) {
    try { results.push(await healthCheck(id)); }
    catch (e) { results.push({ ok: false, server_id: id, error: (e && e.code) || e.message || 'EXCEPTION' }); }
  }
  const legacy = await loadSettingsLegacy();
  const tips = buildTips(results, legacy);
  return { ok: results.every((r) => r.ok), total: results.length, up: results.filter((r) => r.ok).length, down: results.filter((r) => !r.ok).length, results, tips };
}

// ---------------- legacy asterisk_settings shim (back-compat) ----------------
const DEFAULT_LEGACY_SETTINGS = {
  sip_host: '127.0.0.1', sip_port: 5060,
  ami_host: '127.0.0.1', ami_port: 5038,
  ami_username: 'net2app', ami_secret: 'net2app_secret',
  dialplan_context: 'net2app-otp',
  poll_interval_seconds: 5,
  retries_2_wait_seconds: 70, retries_3_wait_seconds: 105,
  max_retries: 1,
  asterisk_installed: false, asterisk_running: false,
  asterisk_config_path: '/etc/asterisk',
  use_existing_config: true,
};
let _legacySettings = Object.assign({}, DEFAULT_LEGACY_SETTINGS);

async function loadSettingsLegacy() {
  if (!_pool) return _legacySettings;
  try {
    const r = await _pool.query('SELECT * FROM asterisk_settings ORDER BY id DESC LIMIT 1');
    if (!r.rows.length) return _legacySettings;
    const row = r.rows[0];
    _legacySettings = Object.assign({}, DEFAULT_LEGACY_SETTINGS, row, {
      use_existing_config: row.use_existing_config !== false,
    });
  } catch (_) {}
  return _legacySettings;
}

async function updateSettingsLegacy(patch) {
  if (!_pool) return _legacySettings;
  const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
  if (!keys.length) return _legacySettings;
  try {
    await _pool.query(
      `UPDATE asterisk_settings SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=NOW() WHERE 1=1`,
      keys.map((k) => patch[k])
    );
  } catch (_) {}
  _legacySettings = Object.assign({}, _legacySettings, patch);
  return _legacySettings;
}

// ---------------- subscription ----------------
function subscribe(cb) { _servListeners.add(cb); return () => _servListeners.delete(cb); }

// ---------------- config generation (opt-in) ----------------
function generatePjsip(s) {
  return `; ===== AUTO-GENERATED by NET2APP Hub =====\n; Date: ${new Date().toISOString()}\n\n[global]\ntype=global\ncontext=${s.dialplan_context || 'net2app-otp'}\n\n[transport-udp]\ntype=transport\nprotocol=udp\nbind=${s.sip_host}:${s.sip_port}\n\n[net2app-platform]\ntype=endpoint\ncontext=${s.dialplan_context || 'net2app-otp'}\nallow=ulaw,alaw,g729\naors=net2app-platform\nauth=net2app-platform-auth\ncallerid="NET2APP" <0000000000>\nqualify_frequency=0\n[net2app-platform-aor]\ntype=aor\nmax_contacts=1\n[net2app-platform-auth]\ntype=auth\nauth_type=userpass\nusername=net2app-platform\npassword=__SHOULD_NOT_REGISTER_OUTBOUND__\n`;
}

function generateExtensions(s) {
  return `; ===== AUTO-GENERATED by NET2APP Hub =====\n; Date: ${new Date().toISOString()}\n\n[general]\nstatic=yes\n\n[${s.dialplan_context || 'net2app-otp'}]\n; Try pre-recorded audio concatenation first (greeting + digits), fall back to TTS\nexten => s,1,NoOp(Net2App OTP — \\${OTP_LANG}/\\${OTP_CODE})\nexten => s,n,Set(LANGUAGE(\\${OTP_LANG}))\nexten => s,n,GotoIf($[\"\\${NET2APP_AUDIO_FILES}\"!=\"\"]?playback:tts)\nexten => s,n(playback),Playback(\\${NET2APP_AUDIO_FILES})\nexten => s,n,Hangup()\nexten => s,n(tts),SayDigits(\\${OTP_CODE})\nexten => s,n,Hangup()\n\nexten => _X.,1,NoOp(Net2App OTP dial out — \\${EXTEN})\nexten => _X.,n,Dial(PJSIP/\\${EXTEN}@net2app-platform,60)\nexten => _X.,n,Hangup()\n`;
}

// CRITICAL: manager.conf is the file that decides whether AMI is exposed
// at all. Without it, asterisk refuses every Action: Login on :5038 with
// "authentication failed" regardless of whether the TCP port is bound.
// Generated each time regenerateConfig() runs so the secret stays in sync
// with asterisk_settings.ami_secret — drifting these silently was the
// root cause of the FAILED /api/asterisk/servers/X/test waves in older
// installs.
function generateManager(s) {
  return `; ===== AUTO-GENERATED by NET2APP Hub =====\n; Date: ${new Date().toISOString()}\n\n[general]\nenabled = yes\nport = 5038\nbindaddr = 0.0.0.0\ndisplayconnects = no\n\n[${s.ami_username || 'net2app'}]\nsecret = ${s.ami_secret || 'net2app_secret'}\ndeny = 0.0.0.0/0.0.0.0\npermit = 0.0.0.0/0.0.0.0\nread = system,call,originate,all\nwrite = system,call,originate,all\nwritetimeout = 1000\n`;
}

function generateModules() {
  return `; ===== AUTO-GENERATED by NET2APP Hub =====\n; Date: ${new Date().toISOString()}\n\n[modules]\nautoload = yes\n\n; PJSIP is the only channel driver the bridge uses (Local/s@context Originate,\n; pjsip.conf registers a 'net2app-platform' endpoint that extensions.conf dials.\nload => res_pjsip.so\nload => res_pjsip_pubsub.so\nload => chan_pjsip.so\nload => pbx_config.so\nload => pbx_loopback.so\n\n; Preload the apps used by extensions.conf — avoids first-call latency.\npreload => app_dial.so\npreload => app_playback.so\npreload => app_saydigits.so\npreload => app_read.so\npreload => app_voicemail.so\npreload => app_stack.so\n\n; Skip modules that aren't needed (and slow boot).\nnoload => chan_iax2.so\nnoload => chan_mgcp.so\nnoload => chan_skinny.so\nnoload => chan_unistim.so\n`;
}

function generateRtp() {
  return `; ===== AUTO-GENERATED by NET2APP Hub =====\n; Date: ${new Date().toISOString()}\n\n[general]\nrtpstart = 10000\nrtpend = 20000\nstun = 0\n`;
}

async function regenerateConfig() {
  const s = await loadSettingsLegacy();
  if (s.use_existing_config) return { skipped: true, reason: 'use_existing_config=true; not overwriting existing dialplan' };
  const targetBase = s.asterisk_config_path || '/etc/asterisk';
  const fallbackBase = path.join(__dirname, 'data', 'asterisk');
  const tryBase = fs.existsSync(targetBase) ? targetBase : fallbackBase;
  if (!fs.existsSync(tryBase)) { try { fs.mkdirSync(tryBase, { recursive: true }); } catch (_) {} }
  // Atomic write: stage each file as `<name>.new` *inside the SAME
  // directory as the production file* (so rename is atomic on the
  // same filesystem), then `renameSync(.new → real)`. This is the
  // standard "atomic-rename" pattern — if a write fails half-way,
  // the OLD production file is still in place. If a rename fails,
  // the .new file is left behind for forensic inspection.
  //
  // The earlier implementation staged files in mkdtemp()/tmp and used
  // copyFileSync — unsafe across filesystems AND non-atomic; either
  // half-updated production OR a tmpdir leak would result.
  const files = {
    'pjsip.conf':     generatePjsip(s),
    'extensions.conf': generateExtensions(s),
    'manager.conf':   generateManager(s),
    'modules.conf':   generateModules(),
    'rtp.conf':       generateRtp(),
  };
  const wrote = [];
  try {
    Object.keys(files).forEach((name) => {
      const dest = path.join(tryBase, name);
      const staged = dest + '.new';
      try {
        fs.writeFileSync(staged, files[name], { mode: 0o640 });
        fs.chmodSync(staged, 0o640);
        fs.renameSync(staged, dest); // atomic on same fs (both inside /etc/asterisk OR data/asterisk)
        wrote.push(dest);
      } catch (e) {
        console.warn('[asterisk] cannot write', dest, e.message);
        // Clean up the .new file so it doesn't masquerade as a real one
        try { fs.unlinkSync(staged); } catch (_) {}
      }
    });
    // Reload asterisk only if it is reachable. Empty fleet or broken PATH
    // shouldn't be a hard error here — the operator reruns the action
    // once asterisk is up.
    try {
      const status = await detectAsteriskLocal();
      if (status.running) {
        execSync('asterisk -rx "core reload"', { stdio: 'pipe', timeout: 4000 });
        console.log('[asterisk] core reload issued after regenerateConfig');
      }
    } catch (e) {
      console.warn('[asterisk] core reload skipped:', e.message);
    }
  } finally {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (_) {}
  }
  // Cache the manager_conf_path on the legacy settings row so /api/asterisk/status
  // can show WHERE the file landed without re-querying.
  if (s.manager_conf_path === undefined) {
    s.manager_conf_path = path.join(tryBase, 'manager.conf');
  }
  return { path_base: tryBase, files: wrote, manager_conf_path: s.manager_conf_path, settings: s };
}

// ---------------- asterisk binary detect / install (host-local) ----------------
async function detectAsteriskLocal() {
  let installed = false, running = false;
  try { execSync('which asterisk', { stdio: 'ignore' }); installed = true; } catch (_) { installed = false; }
  try {
    execSync('pidof asterisk || systemctl is-active asterisk || true', { stdio: 'ignore', timeout: 2000 });
    running = true;
  } catch (_) { running = false; }
  return { installed, running };
}

// tryInstall upgrades the host so AMI is reachable end-to-end:
//  1) apt-get install asterisk (with sudo; defensible in the user's doc once
//     they confirm sudoers grant passwordless asterisk install)
//  2) Write manager.conf to /etc/asterisk with the same ami_username/secret
//     the bridge will use — without this AMI refuses Action: Login even when
//     the binary is running. Falls back to data/asterisk/manager.conf only
//     if /etc/asterisk is unwritable.
//  3) systemctl enable asterisk (persists across reboots)
//  4) systemctl restart asterisk (start now) — non-fatal if systemctl is
//     missing (containers/sandboxes without a PID 1 unit manager)
//  5) Refresh the legacy settings row so /api/asterisk/status reflects
//     reality immediately. DON'T reset use_existing_config on a partial
//     install failure (the operator may still rely on existing dialplan).
async function tryInstall() {
  const steps = [];
  try {
    execSync('sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends asterisk 2>&1 | tail -20', { stdio: 'pipe', timeout: 600000 });
    steps.push({ step: 'apt_install', ok: true });
  } catch (e) {
    steps.push({ step: 'apt_install', ok: false, error: e.message });
    console.warn('[asterisk] apt install failed (non-fatal):', e.message);
    return { ok: false, steps, ...(await detectAsteriskLocal()) };
  }
  // Write manager.conf so AMI is reachable right after the install completes.
  try {
    const cfg = await loadSettingsLegacy();
    const s = cfg || {};
    const target = s.manager_conf_path || '/etc/asterisk/manager.conf';
    const fallback = path.join(__dirname, 'data', 'asterisk', 'manager.conf');
    const dest = fs.existsSync('/etc/asterisk') ? target : fallback;
    if (!fs.existsSync(path.dirname(dest))) { try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch (_) {} }
    fs.writeFileSync(dest, generateManager(s), { mode: 0o640 });
    steps.push({ step: 'manager_conf_written', ok: true, path: dest });
  } catch (e) {
    steps.push({ step: 'manager_conf_written', ok: false, error: e.message });
    console.warn('[asterisk] manager.conf write failed:', e.message);
  }
  // Persist + start. Skip silently if systemctl is missing.
  try { execSync('sudo systemctl enable asterisk', { stdio: 'pipe', timeout: 5000 }); steps.push({ step: 'systemctl_enable', ok: true }); }
  catch (e) { steps.push({ step: 'systemctl_enable', ok: false, error: e.message, skipped: !e.message.match(/systemctl/) }); }
  try { execSync('sudo systemctl restart asterisk', { stdio: 'pipe', timeout: 8000 }); steps.push({ step: 'systemctl_restart', ok: true }); }
  catch (e) { steps.push({ step: 'systemctl_restart', ok: false, error: e.message }); }
  // Reflect new state in the legacy settings.
  const det = await detectAsteriskLocal();
  _legacySettings.asterisk_installed = det.installed;
  _legacySettings.asterisk_running = det.running;
  if (_pool) {
    try {
      await _pool.query(
        `UPDATE asterisk_settings SET asterisk_installed=$1, asterisk_running=$2, updated_at=NOW() WHERE id IS NOT NULL`,
        [det.installed, det.running]
      );
    } catch (_) {}
  }
  steps.push({ step: 'detect', ok: true, installed: det.installed, running: det.running });
  return { ok: det.installed && det.running, steps, ...det };
}

// ---------------- DLR ring buffer (for UI listener-state badge) ----------------
// Per-server ring of the last N AMI events so the UI can show "saw DialEnd
// for call VOC123 at 12:34:56" without polling Java. Default 5 events per
// server, capped to avoid unbounded growth.
const _listenerEvents = new Map(); // serverId -> Array<{ts, event, call_id?, extra?}>
const LISTENER_EVENT_RING = 5;
function pushListenerEvent(serverId, ev) {
  let ring = _listenerEvents.get(serverId);
  if (!ring) { ring = []; _listenerEvents.set(serverId, ring); }
  ring.push(ev);
  while (ring.length > LISTENER_EVENT_RING) ring.shift();
}
function getListenerStateAll() {
  const out = {};
  for (const [id, srv] of _servers.entries()) {
    const st = _listenersByServer.get(id);
    out[id] = {
      server_id: id,
      name: srv.name,
      logged_in: !!(st && st.sock && !st.sock.destroyed && st.loggedIn),
      sock_alive: !!(st && st.sock && !st.sock.destroyed),
      reconnect_pending: !!(st && st.reconnectTimer),
      events: _listenerEvents.get(id) || [],
    };
  }
  return out;
}

// ---------------- DLR push to Java gateway ----------------
// Proxy gwBridge.pushDlr through the bridge module so apiExtensions can
// call _astBridge.gatewayPushDlr(payload) without itself requiring the
// gateway-bridge module. Returns {ok, route} or {ok:false, route:'java_unreachable'}
// NEVER throws — server.cjs poller must keep ticking.
async function gatewayPushDlr(payload) {
  try {
    const r = await gwBridge.pushDlr(payload || {});
    // Annotate last_dlr_pushed_at + last_dlr_push_route on the relevant
    // sip_servers row when caller asked us to attribute it.
    if (_pool && payload && payload.server_id) {
      try {
        await _pool.query(
          `UPDATE sip_servers
              SET last_dlr_pushed_at=NOW(),
                  last_dlr_push_route=$1,
                  last_dlr_push_message_id=$2,
                  updated_at=NOW()
            WHERE id=$3`,
          [r && r.route ? String(r.route) : 'unknown',
           payload.message_id || null,
           parseInt(payload.server_id, 10) || null]
        );
      } catch (_) {}
    }
    return r;
  } catch (e) {
    return { ok: false, route: 'java_unreachable', error: e.message };
  }
}

// ----------------------------------- post-install checklist -------------------
// Returns a per-step array the UI can render as `{label, ok, detail}`. Cheap
// (no AMI handshake — just filesystem + binary probes) so the UI can call
// this before kicking off an install.
async function postInstallChecklist() {
  const checks = [];
  // 1. Binary present.
  let binOk = false, binPath = '';
  try { binPath = execSync('which asterisk', { stdio: 'pipe' }).toString().trim(); binOk = !!binPath; }
  catch (_) {}
  checks.push({ label: 'asterisk binary', ok: binOk, detail: binPath || 'not in PATH' });
  // 2. /etc/asterisk is writable by current user (or sudo-capable).
  let etcOk = false;
  try { etcOk = fs.existsSync('/etc/asterisk') && (fs.statSync('/etc/asterisk').mode & 0o002) !== 0 || process.getuid && process.getuid() === 0; }
  catch (_) { etcOk = false; }
  checks.push({ label: '/etc/asterisk accessible', ok: etcOk, detail: etcOk ? 'writable' : 'missing or read-only' });
  // 3. manager.conf exists at the configured path.
  const cfg = await loadSettingsLegacy();
  const mgrPath = cfg.manager_conf_path || '/etc/asterisk/manager.conf';
  let mgrOk = false;
  try { mgrOk = fs.existsSync(mgrPath) && fs.readFileSync(mgrPath, 'utf8').includes('enabled = yes'); }
  catch (_) { mgrOk = false; }
  checks.push({ label: `manager.conf enabled (${mgrPath})`, ok: mgrOk, detail: mgrOk ? 'enabled = yes found' : 'missing or not enabled' });
  // 4. asterisk_running.
  const det = await detectAsteriskLocal();
  checks.push({ label: 'asterisk process', ok: det.running, detail: det.running ? 'running' : 'not running' });
  // 5. Java gateway reachable (proxy for /dlr_event viability).
  const java = await gwBridge.health();
  const javaOk = !!(java && java.ok);
  checks.push({ label: 'Java SMPP gateway /dlr_event', ok: javaOk, detail: javaOk ? `reachable at ${gwBridge.base}` : `NOT reachable at ${gwBridge.base} (synthetic DLR will queue in sms_logs only)` });
  // 6. At least one sip_servers row with a callable AMI listener OR the
  //    legacy 127.0.0.1 row is up.
  let fleetCallable = false;
  for (const id of _servers.keys()) { if (isServerCallable(id)) { fleetCallable = true; break; } }
  checks.push({ label: 'fleet has a callable AMI listener', ok: fleetCallable, detail: fleetCallable ? `${_servers.size} server(s) registered, one or more logged in` : 'no logged-in AMI listener yet' });
  return checks;
}

// ---------------- exports ----------------
module.exports = {
  setPool,
  // multi-server API (NEW)
  loadServers,
  reloadServersAndRestart,
  pickServer,
  getServer(id) { return _servers.get(id) || null; },
  startAllAMIListeners,
  startAMIListener: startAllAMIListeners, // back-compat alias for server.cjs boot
  awaitCallStatus,
  healthCheck,
  healthCheckAll,
  // per-destination regex routing (voice-OTP scope only — server.cjs poller + /api/voice-otp/send)
  loadDestinations,
  reloadDestinationsAndRestart,
  pickServerForDestination,
  compilePatternSafe,
  normalizeDestination,
  // back-compat (legacy)
  loadSettings: loadSettingsLegacy,
  updateSettings: updateSettingsLegacy,
  regenerateConfig,
  subscribe,
  originate,
  detectAsterisk: detectAsteriskLocal,
  tryInstall,
  // New for the DLR-push-to-ESME flow (this turn).
  gatewayPushDlr,
  getListenerStateAll,
  pushListenerEvent,
  postInstallChecklist,
  health: async () => ({
    ok: _servers.size > 0,
    server_count: _servers.size,
    servers: Array.from(_servers.values()).map((s) => ({
      id: s.id, name: s.name, ami_host: s.ami_host, ami_port: s.ami_port,
      status: s.last_health_status || 'unknown',
      latency_ms: s.last_health_latency_ms || null,
    })),
  }),
};
