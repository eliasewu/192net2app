module.exports = function(app, pool, auth, seedPasswords, bridge) {

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'net2app-hub-' + Date.now();
const API_TOKEN_EXPIRY = '8h';
const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000; // 24h grace period for token refresh

// Auto-upgrade plaintext smpp_password to bcrypt on first successful login
async function upgradeSmppPassword(pool, clientId, password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE clients SET smpp_password = $1 WHERE id = $2', [hash, clientId]);
    console.log(`[bcrypt-upgrade] Client ${clientId} password upgraded to bcrypt`);
  } catch (e) {
    console.error(`[bcrypt-upgrade] Failed for client ${clientId}:`, e.message);
  }
}

// Shared SMPP password authentication (bcrypt with plaintext fallback)
// Returns { valid, client } — also auto-upgrades plaintext on success
async function verifySmppPassword(pool, username, password) {
  const r = await pool.query("SELECT * FROM clients WHERE smpp_username = $1 AND status = 'active' AND api_enabled = true", [username]);
  if (!r.rows.length) return { valid: false, client: null };
  const client = r.rows[0];
  let valid = false;
  if (client.smpp_password && client.smpp_password.startsWith('$2')) {
    valid = await bcrypt.compare(password, client.smpp_password);
  } else {
    valid = client.smpp_password === password;
    if (valid) {
      // Auto-upgrade plaintext to bcrypt (fire-and-forget)
      upgradeSmppPassword(pool, client.id, password);
    }
  }
  return { valid, client };
}

// ============================================================
// PASSWORD-BASED AUTH — Login endpoint for external clients
// ============================================================
app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    
    // IP enforcement: check blacklists
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    // Try clients table first (smpp_username / smpp_password) — auto-upgrades plaintext to bcrypt
    const smppAuth = await verifySmppPassword(pool, username, password);
    if (smppAuth.client) {
      if (!smppAuth.valid) return res.status(401).json({ error: "Invalid credentials" });
      const client = smppAuth.client;
      const token = jwt.sign({ id: client.id, client_code: client.client_code, type: 'client', role: 'client' }, JWT_SECRET, { expiresIn: API_TOKEN_EXPIRY });
      return res.json({ success: true, token, client: { id: client.id, client_code: client.client_code, company_name: client.company_name, billing_mode: client.billing_mode, currency: client.currency }, expires_in: API_TOKEN_EXPIRY });
    }
    
    // Try users table (for platform users with API access)
    const userR = await pool.query("SELECT * FROM users WHERE username = $1 AND is_active = true", [username]);
    if (userR.rows.length) {
      const user = userR.rows[0];
      let valid = await bcrypt.compare(password, user.password_hash);
      // Fallback: if bcrypt fails but this is a seed user whose password matches
      // the known plaintext seed password, accept and re-hash.
      if (!valid && seedPasswords && seedPasswords[username] && password === seedPasswords[username]) {
        console.log(`[external-api] seed fallback for '${username}' — re-hashing to fresh bcrypt`);
        const fresh = await bcrypt.hash(password, 10);
        pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [fresh, user.id])
          .catch(e => console.warn('[external-api] re-hash update failed for', username, e.message));
        valid = true;
      }
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      
      const token = jwt.sign({ id: user.id, username: user.username, type: 'user', role: user.role }, JWT_SECRET, { expiresIn: API_TOKEN_EXPIRY });
      return res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role }, expires_in: API_TOKEN_EXPIRY });
    }
    
    return res.status(401).json({ error: "Invalid credentials" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Token verification endpoint
app.get("/api/v1/auth/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ error: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, valid: true, type: decoded.type, expires: new Date(decoded.exp * 1000).toISOString() });
  } catch (e) { res.status(401).json({ error: "Invalid or expired token" }); }
});

// Token refresh endpoint — extend expiry without re-login
// Accepts valid tokens + recently-expired tokens (24h grace period)
app.post("/api/v1/auth/refresh", async (req, res) => {
  try {
    // IP enforcement: check blacklists
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: "Bearer token required" });

    // Verify with relaxed expiry — allow tokens expired up to 24h ago
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      if (e.name === 'TokenExpiredError') {
        // Allow refresh up to REFRESH_GRACE period after expiry
        decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        const ageMs = Date.now() - (decoded.exp * 1000);
        if (ageMs > REFRESH_GRACE_MS) {
          return res.status(401).json({ error: "Token expired beyond refresh window. Please re-login." });
        }
      } else {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    // Verify the entity still exists and is active
    if (decoded.type === 'client') {
      const r = await pool.query("SELECT id, client_code, company_name FROM clients WHERE id = $1 AND status = 'active'", [decoded.id]);
      if (!r.rows.length) return res.status(401).json({ error: "Client account inactive or removed" });
      const client = r.rows[0];
      const newToken = jwt.sign(
        { id: client.id, client_code: client.client_code, type: 'client', role: 'client' },
        JWT_SECRET, { expiresIn: API_TOKEN_EXPIRY }
      );
      return res.json({ success: true, token: newToken, client: { id: client.id, client_code: client.client_code, company_name: client.company_name }, expires_in: API_TOKEN_EXPIRY });
    }

    if (decoded.type === 'user') {
      const r = await pool.query("SELECT id, username, email, role FROM users WHERE id = $1 AND is_active = true", [decoded.id]);
      if (!r.rows.length) return res.status(401).json({ error: "User account inactive or removed" });
      const user = r.rows[0];
      const newToken = jwt.sign(
        { id: user.id, username: user.username, type: 'user', role: user.role },
        JWT_SECRET, { expiresIn: API_TOKEN_EXPIRY }
      );
      return res.json({ success: true, token: newToken, user: { id: user.id, username: user.username, email: user.email, role: user.role }, expires_in: API_TOKEN_EXPIRY });
    }

    return res.status(401).json({ error: "Unknown token type" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Password-based token auth middleware
function authPasswordToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.apiUser = decoded;
  } catch { /* invalid token, fall through */ }
  return next();
}

// ============================================================
// RATE LIMITING MIDDLEWARE (Token Bucket - in-memory)
// ============================================================
const rateLimiters = new Map();

setInterval(() => {
  if (rateLimiters.size > 10000) {
    const keys = [...rateLimiters.keys()].slice(0, 5000);
    keys.forEach(k => rateLimiters.delete(k));
  }
}, 600000);

function getRateLimiter(clientId, tps) {
  const now = Date.now();
  let limiter = rateLimiters.get(clientId);
  if (!limiter || limiter.tps !== tps) {
    limiter = { tokens: tps, lastRefill: now, tps };
    rateLimiters.set(clientId, limiter);
  }
  const elapsed = (now - limiter.lastRefill) / 1000;
  limiter.tokens = Math.min(limiter.tps, limiter.tokens + elapsed * (limiter.tps / 10 || 1));
  limiter.lastRefill = now;
  
  if (limiter.tokens < 1) return { allowed: false, retryAfter: Math.ceil((1 - limiter.tokens) / (limiter.tps / 10 || 1)) };
  limiter.tokens -= 1;
  return { allowed: true, retryAfter: 0 };
}

// ============================================================
// AUTHENTICATION (Bearer token → API key → username/password)
// ============================================================
async function authClient(req, res) {
  const apiKey = req.headers["x-api-key"];
  const username = req.body?.username || req.query?.username;
  const password = req.body?.password || req.query?.password;

  // 1. Check for Bearer token from /api/v1/auth/login
  if (req.apiUser) {
    const decoded = req.apiUser;
    if (decoded.type === 'client') {
      const r = await pool.query("SELECT * FROM clients WHERE id = $1 AND status = 'active'", [decoded.id]);
      if (r.rows.length) {
        const client = r.rows[0];
        const limiter = getRateLimiter(client.id, 100);
        if (!limiter.allowed) {
          res.set('Retry-After', String(limiter.retryAfter));
          return res.status(429).json({ error: `Rate limit exceeded. Retry after ${limiter.retryAfter}s` });
        }
        return client;
      }
    }
  }

  // 2. Try API key (hashed + legacy plaintext)
  if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const r = await pool.query(
      `SELECT k.*, c.id as cid, c.client_code, c.company_name, c.balance, c.credit_limit, c.currency, c.billing_mode, c.api_enabled, c.status
       FROM api_keys k JOIN clients c ON k.client_id = c.id
       WHERE k.api_key_hash = $1 AND k.is_active = true AND c.status = 'active'`,
      [keyHash]
    );
    if (r.rows.length) {
      const client = r.rows[0];
      const limiter = getRateLimiter(client.cid, client.rate_limit_tps || 10);
      if (!limiter.allowed) {
        res.set('Retry-After', String(limiter.retryAfter));
        return res.status(429).json({ error: `Rate limit exceeded. Retry after ${limiter.retryAfter}s` });
      }
      await pool.query('UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1', [client.id]);
      return client;
    }
    
    const r2 = await pool.query(
      "SELECT * FROM clients WHERE api_key = $1 AND status = 'active' AND api_enabled = true",
      [apiKey]
    );
    if (r2.rows.length) return r2.rows[0];
  }
  
  // 3. Try username/password (bcrypt or plaintext) — auto-upgrades plaintext to bcrypt
  if (username && password) {
    const smppAuth = await verifySmppPassword(pool, username, password);
    if (smppAuth.client && smppAuth.valid) {
      const client = smppAuth.client;
      const limiter = getRateLimiter(client.id, 100);
      if (!limiter.allowed) {
        res.set('Retry-After', String(limiter.retryAfter));
        return res.status(429).json({ error: `Rate limit exceeded. Retry after ${limiter.retryAfter}s` });
      }
      return client;
    }
  }
  
  res.status(401).json({ error: "Authentication required. Use Bearer token, X-API-Key header, or username+password." });
  return null;
}

// ============================================================
// DAILY QUOTA CHECK
// ============================================================
async function checkQuota(clientId) {
  const r = await pool.query(
    'SELECT daily_quota, usage_count, usage_reset_at::text FROM api_keys WHERE client_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
    [clientId]
  );
  if (!r.rows.length) return { allowed: true };
  const key = r.rows[0];
  const today = new Date().toISOString().split('T')[0];
  const resetDay = typeof key.usage_reset_at === 'string' ? key.usage_reset_at : String(key.usage_reset_at || '').split('T')[0];
  if (resetDay !== today) {
    await pool.query('UPDATE api_keys SET usage_count = 0, usage_reset_at = CURRENT_DATE WHERE client_id = $1 AND is_active = true', [clientId]);
    return { allowed: true, used: 0, quota: key.daily_quota };
  }
  const remaining = key.daily_quota - key.usage_count;
  return { allowed: remaining > 0, used: key.usage_count, quota: key.daily_quota, remaining };
}

// ============================================================
// ENDPOINTS
// ============================================================

// SMS Send — full routing pipeline (route_maps → routes → trunks → supplier → dispatch)
app.post("/api/v1/sms/send", authPasswordToken, async (req, res) => {
  try {
    // IP enforcement (pre-auth, pre-rate-limit): check blacklists + whitelist
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    let ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    const client = await authClient(req, res);
    if (!client) return;
    const c = client;
    const clientId = c.cid || c.id;
    
    // IP enforcement (post-auth): enforce per-client smpp_ip whitelist
    ipCheck = await pool.checkIpEnforcement(callerIp, clientId);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    const quota = await checkQuota(clientId);
    if (!quota.allowed) return res.status(429).json({ error: `Daily quota exceeded (${quota.used}/${quota.quota})` });
    
    const { to, from, text, dlr_url } = req.body;
    if (!to || !text) return res.status(400).json({ error: "to and text are required" });
    
    const destination = to;
    const sender_id = from || c.smpp_username;
    const message = text;
    
    // ─── Resolve MCC/MNC/country ─────────────────────────────────
    const digitsOnly = String(destination || '').replace(/[^0-9]/g, '');
    const mccGuess = digitsOnly.length >= 3 ? digitsOnly.substring(0, 3) : null;
    let mcc = null, mnc = null, country = null, operator = null;
    if (mccGuess) {
      const match = await pool.query(
        "SELECT mcc, mnc, country, operator FROM mccmnc WHERE mcc = $1 ORDER BY mnc LIMIT 1",
        [mccGuess]
      );
      if (match.rows.length) {
        mcc = match.rows[0].mcc;
        mnc = match.rows[0].mnc;
        country = match.rows[0].country;
        operator = match.rows[0].operator;
      }
    }
    
    // ─── Route resolution (shared helper) ────────────────────────
    const route = await pool.resolveRouteForClient(clientId, destination);
    let supplier = null, routeId = null, routeName = null, supplierConnType = null, trunkId = null, trunkName = null;
    if (route) {
      supplier = { id: route.supplier_id, code: route.supplier_code };
      supplierConnType = route.connection_type;
      routeId = route.route_id;
      routeName = route.route_name;
      trunkId = route.trunk_id;
      trunkName = route.trunk_name;
    }
    
    // ─── Rate lookup ─────────────────────────────────────────────
    let clientRate = 0.025, supplierRate = 0.015;
    if (supplier) {
      const cr = await pool.query(
        "SELECT rate FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true AND (($2::text IS NULL) OR (mcc = $2)) LIMIT 1",
        [clientId, mcc]
      );
      if (cr.rows.length) clientRate = parseFloat(cr.rows[0].rate);
      const sr = await pool.query(
        "SELECT rate FROM rates WHERE entity_type='supplier' AND entity_id=$1 AND is_active=true AND (($2::text IS NULL) OR (mcc = $2)) LIMIT 1",
        [supplier.id, mcc]
      );
      if (sr.rows.length) supplierRate = parseFloat(sr.rows[0].rate);
    }
    
    // ─── Profit check ────────────────────────────────────────────
    const parts = Math.ceil((message || '').length / 160);
    const profit = clientRate - supplierRate;
    if (profit <= 0) return res.status(400).json({ error: `ROUTE BLOCKED: No profit. Client rate €${clientRate.toFixed(4)} ≤ Supplier rate €${supplierRate.toFixed(4)}` });
    
    // ─── Balance check ───────────────────────────────────────────
    const available = parseFloat(c.balance || 0) + parseFloat(c.credit_limit || 0);
    const cost = clientRate * parts;
    if (available < cost) return res.status(402).json({ error: `Insufficient balance. Available: €${available.toFixed(2)}, Need: €${cost.toFixed(4)}` });
    
    // ─── Billing mode ────────────────────────────────────────────
    const billingMode = c.billing_mode || 'dlr';
    
    // ─── Insert SMS log with full route info ─────────────────────
    const msgId = 'MSG' + Date.now() + Math.random().toString(36).substring(2, 6);
    const ir = await pool.query(
      `INSERT INTO sms_logs
        (message_id, client_id, client_code, supplier_id, supplier_code,
         sender_id, destination, mcc, mnc, country, operator,
         message, message_parts,
         client_rate, supplier_rate, profit, currency,
         status, submit_time,
         route_id, route_name, trunk_id, trunk_name, dlr_callback_url)
       VALUES
        ($1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13,
         $14, $15, $16, $17,
         'submitted', NOW(),
         $18, $19, $20, $21, $22)
       RETURNING *`,
      [msgId,
       clientId, c.client_code,
       supplier?.id || null, supplier?.code || null,
       sender_id, destination,
       mcc, mnc, country, operator,
       message, parts,
       clientRate, supplierRate, profit,
       c.currency || 'EUR',
       routeId, routeName, trunkId, trunkName,
       dlr_url || null]
    );
    
    // ─── Submit-mode billing: charge immediately ─────────────────
    if (billingMode === 'submit') {
      await pool.query('UPDATE clients SET balance = balance - $1 WHERE id = $2', [cost, clientId]);
    }
    
    // ─── Dispatch through the appropriate channel ────────────────
    if (supplier && bridge) {
      const ct = supplierConnType;
      if (ct === 'ott_whatsapp') {
        // WhatsApp Cloud API dispatch
        const sas = await pool.query(
          "SELECT * FROM social_api_suppliers WHERE platform = 'whatsapp_cloud' AND is_active = true ORDER BY created_at DESC LIMIT 1"
        );
        const wa = sas.rows[0];
        if (wa && wa.phone_number_id && wa.access_token) {
          const waApiUrl = `https://graph.facebook.com/v21.0/${wa.phone_number_id}/messages`;
          const waHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wa.access_token}` };
          const waPayload = { messaging_product: 'whatsapp', to: String(destination).replace(/[^0-9]/g, ''), type: 'text', text: { body: String(message) } };
          let waAgent = undefined;
          if (wa.proxy_enabled && wa.proxy_host) {
            try {
              const { SocksProxyAgent } = require('socks-proxy-agent');
              const auth2 = wa.proxy_username ? `${encodeURIComponent(wa.proxy_username)}:${encodeURIComponent(wa.proxy_password || '')}@` : '';
              waAgent = new SocksProxyAgent(`socks5://${auth2}${wa.proxy_host}:${wa.proxy_port}`);
            } catch (_) {}
          }
          try {
            const waOpts = { method: 'POST', headers: waHeaders, body: JSON.stringify(waPayload), signal: AbortSignal.timeout(15000) };
            if (waAgent) waOpts.agent = waAgent;
            const waResp = await fetch(waApiUrl, waOpts);
            const waBody = await waResp.json();
            const waMsgId = waBody?.messages?.[0]?.id || null;
            if (waResp.ok && waMsgId) {
              pool.query('UPDATE sms_logs SET smpp_message_id = $1, channel = $2 WHERE message_id = $3', [waMsgId, 'whatsapp', msgId]).catch(() => {});
              console.log(`[ext-api] WhatsApp dispatched: ${msgId} -> wa:${waMsgId}`);
            } else {
              const waErr = waBody?.error?.message || `HTTP ${waResp.status}`;
              pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [waErr.substring(0, 500), msgId]).catch(() => {});
              console.warn(`[ext-api] WhatsApp failed for ${msgId}: ${waErr}`);
            }
          } catch (waFetchErr) {
            pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [waFetchErr.message?.substring(0, 500) || 'WhatsApp API unreachable', msgId]).catch(() => {});
            console.warn(`[ext-api] WhatsApp fetch error for ${msgId}:`, waFetchErr.message);
          }
        } else {
          setTimeout(async () => {
            await pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = 'No WhatsApp Cloud API configuration', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]);
          }, 1000);
        }
      } else if (ct === 'ott_telegram') {
        // Telegram Bot API dispatch
        const tgs = await pool.query(
          "SELECT * FROM social_api_suppliers WHERE platform = 'telegram_bot' AND is_active = true ORDER BY created_at DESC LIMIT 1"
        );
        const tg = tgs.rows[0];
        if (tg && tg.bot_token) {
          const tgApiUrl = `https://api.telegram.org/bot${tg.bot_token}/sendMessage`;
          const tgHeaders = { 'Content-Type': 'application/json' };
          const tgPayload = { chat_id: String(destination), text: String(message), parse_mode: 'HTML', disable_web_page_preview: true };
          let tgAgent = undefined;
          if (tg.proxy_enabled && tg.proxy_host) {
            try {
              const { SocksProxyAgent } = require('socks-proxy-agent');
              const auth3 = tg.proxy_username ? `${encodeURIComponent(tg.proxy_username)}:${encodeURIComponent(tg.proxy_password || '')}@` : '';
              tgAgent = new SocksProxyAgent(`socks5://${auth3}${tg.proxy_host}:${tg.proxy_port}`);
            } catch (_) {}
          }
          try {
            const tgOpts = { method: 'POST', headers: tgHeaders, body: JSON.stringify(tgPayload), signal: AbortSignal.timeout(15000) };
            if (tgAgent) tgOpts.agent = tgAgent;
            const tgResp = await fetch(tgApiUrl, tgOpts);
            const tgBody = await tgResp.json();
            const tgMsgId = tgBody?.result?.message_id || null;
            if (tgResp.ok && tgBody.ok && tgMsgId) {
              pool.query('UPDATE sms_logs SET smpp_message_id = $1, channel = $2 WHERE message_id = $3', [String(tgMsgId), 'telegram', msgId]).catch(() => {});
              console.log(`[ext-api] Telegram dispatched: ${msgId} -> tg:${tgMsgId}`);
            } else {
              const tgErr = tgBody?.description || `HTTP ${tgResp.status}`;
              pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [tgErr.substring(0, 500), msgId]).catch(() => {});
              console.warn(`[ext-api] Telegram failed for ${msgId}: ${tgErr}`);
            }
          } catch (tgFetchErr) {
            pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [tgFetchErr.message?.substring(0, 500) || 'Telegram API unreachable', msgId]).catch(() => {});
            console.warn(`[ext-api] Telegram fetch error for ${msgId}:`, tgFetchErr.message);
          }
        } else {
          setTimeout(async () => {
            await pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = 'No Telegram Bot API configuration', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]);
          }, 1000);
        }
      } else if (['http', 'rcs', 'flash_sms'].includes(ct)) {
        // ── HTTP / RCS / Flash SMS dispatch via api_connectors ──────
        const supReq = await pool.query('SELECT * FROM suppliers WHERE id = $1', [supplier.id]);
        const supRow = supReq.rows[0];
        if (supRow) {
          let targetUrl, method, headers = { 'Content-Type': 'application/json' }, submitRegex = null;
          if (supRow.api_connector_id) {
            const connReq = await pool.query('SELECT * FROM api_connectors WHERE id = $1 AND is_active = true', [supRow.api_connector_id]);
            const conn = connReq.rows[0];
            if (conn) {
              targetUrl = conn.send_url;
              method = conn.http_method || 'POST';
              if (conn.auth_type === 'API_KEY') headers['X-API-Key'] = conn.api_key || '';
              if (conn.auth_type === 'BEARER') headers['Authorization'] = `Bearer ${conn.api_key || ''}`;
              if (conn.submit_pattern) submitRegex = new RegExp(conn.submit_pattern);
            }
          }
          if (!targetUrl) {
            targetUrl = supRow.api_url;
            method = supRow.api_method || 'POST';
            if (supRow.api_key) headers['Authorization'] = `Bearer ${supRow.api_key}`;
          }
          if (targetUrl) {
            try {
              const fetchOpts = { method, headers, body: JSON.stringify({ to: destination, from: sender_id || 'NET2APP', text: message }), signal: AbortSignal.timeout(15000) };
              const resp = await fetch(targetUrl, fetchOpts);
              const respText = await resp.text();
              if (resp.ok) {
                const matched = submitRegex ? submitRegex.exec(respText) : null;
                const extMsgId = matched ? matched[1] : `EXT_${Date.now()}`;
                pool.query('UPDATE sms_logs SET smpp_message_id = $1, channel = $2 WHERE message_id = $3', [extMsgId, ct, msgId]).catch(() => {});
                console.log(`[ext-api] ${ct} dispatched: ${msgId} -> ${extMsgId}`);
              } else {
                pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [respText.substring(0, 500), msgId]).catch(() => {});
                console.warn(`[ext-api] ${ct} dispatch failed for ${msgId}: HTTP ${resp.status}`);
              }
            } catch (err) {
              pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = $1, delivery_time = NOW() WHERE message_id = $2", [err.message?.substring(0, 500) || 'API unreachable', msgId]).catch(() => {});
              console.warn(`[ext-api] ${ct} fetch error for ${msgId}:`, err.message);
            }
          } else {
            setTimeout(async () => await pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = 'No API Connector Configured', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]), 1000);
          }
        } else {
          setTimeout(async () => await pool.query("UPDATE sms_logs SET status = 'failed', dlr_status = 'UNDELIV', error_message = 'Supplier record not found', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]), 1000);
        }
      } else if (ct === 'voice_otp') {
        // ── Voice OTP dispatch ─────────────────────────────────────
        const vSupReq = await pool.query('SELECT voice_otp_config_id FROM suppliers WHERE id = $1', [supplier.id]);
        const vConfigId = vSupReq.rows[0]?.voice_otp_config_id;
        if (vConfigId) {
          const vCfg = await pool.query('SELECT * FROM voice_otp_configs WHERE id = $1 AND is_active = true', [vConfigId]);
          const cfg = vCfg.rows[0];
          if (cfg) {
            const destDigits = String(destination || '').replace(/[^0-9]/g, '');
            let matchedPrefix = null;
            if (cfg.country_prefix) {
              const prefixes = cfg.country_prefix.split(',').map(p => p.trim()).filter(Boolean);
              for (const pfx of prefixes) { if (destDigits.startsWith(pfx)) { matchedPrefix = pfx; break; } }
            }
            const otpCode = String(message || '').replace(/[^0-9]/g, '');
            const primaryLang = cfg.primary_language_code || cfg.language_code || 'en';
            const secondaryLang = cfg.secondary_language_code || null;
            const languageLabel = primaryLang;
            const callId = 'VOC' + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();
            await pool.query(
              `INSERT INTO voice_call_retry_queue (call_id, destination, otp_code, language, retry_count, max_retries, next_attempt_at, status, client_id)
               VALUES ($1, $2, $3, $4, 0, 2, NOW(), 'pending', $5)`,
              [callId, destination, otpCode, languageLabel, clientId]
            );
            await pool.query(
              `INSERT INTO voice_otp_logs (call_id, destination, otp_code, language, retry_count, max_retries, status, dlr_status, client_id)
               VALUES ($1, $2, $3, $4, 0, 2, 'initiated', 'PENDING', $5)`,
              [callId, destination, otpCode, languageLabel, clientId]
            );
            await pool.query(
              `UPDATE sms_logs SET channel = 'voice_otp', smpp_message_id = $1, sender_id = COALESCE($2, sender_id)
               WHERE message_id = $3`,
              [callId, cfg.caller_id || 'voice_otp', msgId]
            );
            console.log(`[ext-api] voice_otp enqueued: ${msgId} -> call ${callId} lang=${languageLabel} prefix=${matchedPrefix || 'auto'} otp_len=${otpCode.length}`);
          } else {
            await pool.query("UPDATE sms_logs SET channel = 'voice_otp', status = 'failed', dlr_status = 'UNDELIV', error_message = 'Voice OTP config not found or inactive', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]);
          }
        } else {
          await pool.query("UPDATE sms_logs SET channel = 'voice_otp', status = 'failed', dlr_status = 'UNDELIV', error_message = 'No voice_otp_config_id on supplier', dlr_timestamp = NOW() WHERE message_id = $1", [msgId]);
        }
      } else {
        // Default: SMPP gateway dispatch
        bridge.submitSm({
          supplier_id: supplier.id,
          supplier_code: supplier.code,
          client_id: clientId,
          client_code: c.client_code,
          sender_id: sender_id || '',
          destination: destination,
          message: message,
          message_id: msgId
        }).then(gwRes => {
          if (gwRes && gwRes.smpp_message_id) {
            pool.query('UPDATE sms_logs SET smpp_message_id = $1 WHERE message_id = $2',
              [gwRes.smpp_message_id, msgId]).catch(() => {});
          }
        }).catch(err => console.warn('[ext-api] gateway submitSm error:', err.message));
      }
    } else if (!supplier) {
      // No supplier routed — mark as failed
      setTimeout(async () => {
        await pool.query(`UPDATE sms_logs SET status='failed', dlr_status='UNDELIV', dlr_timestamp=NOW() WHERE message_id=$1`, [msgId]);
      }, 1000);
    }
    
    // ─── Response ────────────────────────────────────────────────
    res.json({
      success: true,
      data: {
        message_id: msgId,
        to: destination,
        from: sender_id,
        text: message,
        parts,
        rate: clientRate,
        supplier_rate: supplierRate,
        profit: parseFloat(profit.toFixed(4)),
        currency: c.currency || 'EUR',
        cost: parseFloat(cost.toFixed(4)),
        status: 'submitted',
        billing_mode: billingMode,
        route: routeName,
        submitted_at: new Date().toISOString()
      },
      quota: quota.quota ? { used: quota.used + 1, quota: quota.quota } : undefined
    });
  } catch (e) {
    console.error('[ext-api] sms/send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DLR Query
app.get("/api/v1/sms/dlr/:messageId", authPasswordToken, async (req, res) => {
  try {
    // Try Bearer token first
    let clientId = null;
    if (req.apiUser && req.apiUser.type === 'client') {
      clientId = req.apiUser.id;
    } else {
      // Fallback to API key or username/password
      const apiKey = req.headers["x-api-key"];
      const username = req.query.username;
      const password = req.query.password;
      
      if (apiKey) {
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const r = await pool.query("SELECT client_id FROM api_keys WHERE api_key_hash = $1 AND is_active = true", [keyHash]);
        if (r.rows.length) clientId = r.rows[0].client_id;
        else {
          const r2 = await pool.query("SELECT id FROM clients WHERE api_key = $1", [apiKey]);
          if (r2.rows.length) clientId = r2.rows[0].id;
        }
      } else if (username && password) {
        const smppAuth = await verifySmppPassword(pool, username, password);
        if (smppAuth.valid && smppAuth.client) clientId = smppAuth.client.id;
      }
    }
    
    if (!clientId) return res.status(401).json({ error: "Authentication required" });
    
    // IP enforcement: check blacklists
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    const r = await pool.query(
      `SELECT message_id, destination, status, dlr_status, dlr_timestamp, submit_time, delivery_time, error_code, error_message
       FROM sms_logs WHERE message_id = $1 AND client_id = $2`,
      [req.params.messageId, clientId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    
    const log = r.rows[0];
    res.json({ success: true, data: {
      message_id: log.message_id, destination: log.destination, status: log.status,
      dlr_status: log.dlr_status, dlr_timestamp: log.dlr_timestamp,
      submit_time: log.submit_time, delivery_time: log.delivery_time,
      error_code: log.error_code, error_message: log.error_message
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Balance
app.get("/api/v1/account/balance", authPasswordToken, async (req, res) => {
  try {
    let client = null;
    if (req.apiUser && req.apiUser.type === 'client') {
      const r = await pool.query("SELECT * FROM clients WHERE id = $1", [req.apiUser.id]);
      if (r.rows.length) client = r.rows[0];
    } else {
      const apiKey = req.headers["x-api-key"];
      const username = req.query.username;
      const password = req.query.password;
      
      if (apiKey) {
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const r = await pool.query(
          `SELECT c.* FROM api_keys k JOIN clients c ON k.client_id = c.id WHERE k.api_key_hash = $1 AND k.is_active = true`,
          [keyHash]
        );
        if (r.rows.length) client = r.rows[0];
        else {
          const r2 = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
          if (r2.rows.length) client = r2.rows[0];
        }
      } else if (username && password) {
        const smppAuth = await verifySmppPassword(pool, username, password);
        if (smppAuth.valid && smppAuth.client) client = smppAuth.client;
      }
    }
    
    if (!client) return res.status(401).json({ error: "Authentication required" });
    const c = client;
    
    // IP enforcement: check blacklists
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    res.json({ success: true, data: {
      balance: parseFloat(c.balance),
      credit_limit: parseFloat(c.credit_limit || 0),
      available: parseFloat(c.balance) + parseFloat(c.credit_limit || 0),
      currency: c.currency || "EUR",
      billing_mode: c.billing_mode
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API Usage Stats
app.get("/api/v1/account/usage", authPasswordToken, async (req, res) => {
  try {
    const client = await authClient(req, res);
    if (!client) return;
    const cid = client.cid || client.id;
    
    // IP enforcement: check blacklists
    const callerIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const ipCheck = await pool.checkIpEnforcement(callerIp);
    if (ipCheck.blocked) return res.status(403).json({ error: ipCheck.reason });
    
    const r = await pool.query(
      'SELECT api_key_prefix, rate_limit_tps, daily_quota, usage_count, last_used_at, is_active FROM api_keys WHERE client_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [cid]
    );
    if (!r.rows.length) return res.json({ success: true, data: { keys: 0 } });
    const k = r.rows[0];
    res.json({ success: true, data: {
      api_key_prefix: k.api_key_prefix, rate_limit_tps: k.rate_limit_tps,
      daily_quota: k.daily_quota, used_today: k.usage_count,
      remaining: Math.max(0, k.daily_quota - k.usage_count), last_used: k.last_used_at
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

console.log("[API] External client API loaded (auth: Bearer token + API key + username/password, rate-limited)");
};
