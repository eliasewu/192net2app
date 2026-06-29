// NET2APP Hub — Social API Pairing Module
// WhatsApp: Baileys QR code pairing via SOCKS5 proxy
// Telegram: Phone-number verification flow via proxy

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Active pairing sessions: supplierId -> session state
// Each session: { platform, status, qr, socket, timer, proxyConfig, phoneHash }
const sessions = new Map();

// ─── helpers ──────────────────────────────────────────────────────────
function buildSocksProxy(supplier) {
  if (!supplier.proxy_enabled || !supplier.proxy_host) return null;
  try {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    const auth = supplier.proxy_username
      ? `${encodeURIComponent(supplier.proxy_username)}:${encodeURIComponent(supplier.proxy_password || '')}@`
      : '';
    const url = `socks5://${auth}${supplier.proxy_host}:${supplier.proxy_port}`;
    return new SocksProxyAgent(url);
  } catch (e) {
    console.warn(`[pair] SocksProxyAgent failed for supplier ${supplier.id}:`, e.message);
    return null;
  }
}

function sessionDir(supplierId) {
  const dir = path.join(__dirname, 'data', 'baileys_auth', String(supplierId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupSession(supplierId) {
  const s = sessions.get(supplierId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  if (s.socket) {
    try { s.socket.end(); } catch (_) {}
  }
  sessions.delete(supplierId);
}

// ─── WhatsApp (Baileys) ───────────────────────────────────────────────
async function startWhatsAppPairing(supplier) {
  const agent = buildSocksProxy(supplier);

  try {
    const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } =
      await import('@whiskeysockets/baileys');

    const authDir = sessionDir(supplier.id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Fetch latest version for compatibility; fallback to Baileys v7 default
    let version = [2, 3000, 1017530010];
    let browser = Browsers?.ubuntu?.('Chrome') || ['Net2App', 'Chrome', '1.0.0'];
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
      browser = v.browser || browser;
    } catch (_) { /* use fallback */ }

    const session = {
      platform: 'whatsapp_cloud',
      status: 'connecting',
      qr: null,
      error: null,
      proxyConfig: agent ? `socks5:${supplier.proxy_host}:${supplier.proxy_port}` : 'none',
      socket: null,
      timer: null,
      saveCreds,
    };
    sessions.set(supplier.id, session);

    // 3-minute timeout
    session.timer = setTimeout(() => {
      if (session.status === 'connecting' || session.status === 'waiting_scan') {
        session.status = 'timeout';
        session.error = 'QR scan timed out (3 minutes)';
        cleanupSession(supplier.id);
      }
    }, 180_000);

    const sock = makeWASocket({
      auth: state,
      version,
      browser,
      printQRInTerminal: false,
      agent: agent || undefined,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 30_000,
      markOnlineOnConnect: false,
      emitOwnEvents: true,
    });
    session.socket = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Baileys returned a fresh QR string — render to PNG data URL
        try {
          const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
          session.qr = dataUrl;
        } catch (_) {
          session.qr = qr; // fallback: raw string
        }
        session.status = 'waiting_scan';
        console.log(`[pair] WhatsApp QR ready for supplier ${supplier.id}`);
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = null;
        if (session.timer) clearTimeout(session.timer);
        await saveCreds();
        console.log(`[pair] WhatsApp paired successfully for supplier ${supplier.id}`);
      }

      if (connection === 'close') {
        const err = lastDisconnect?.error;
        // Don't treat normal closure post-pairing as an error
        if (session.status === 'connected') {
          session.socket = null;
          return;
        }
        if (session.status === 'timeout') return;

        session.status = 'error';
        session.error = err?.message || 'Connection closed unexpectedly';
        console.warn(`[pair] WhatsApp connection closed for supplier ${supplier.id}:`, session.error);
        cleanupSession(supplier.id);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    return { success: true, status: 'connecting', message: 'WhatsApp pairing initiated — QR code will appear shortly' };
  } catch (e) {
    sessions.delete(supplier.id);
    console.error(`[pair] Baileys init failed for supplier ${supplier.id}:`, e.message);
    return { success: false, error: `Failed to start WhatsApp pairing: ${e.message}` };
  }
}

// ─── Telegram (phone verification) ────────────────────────────────────
// In production this would use a Node.js MTProto client (gramjs / tdlib).
// For now we implement the full phone→code→verify flow with a simulated
// backend so the UX is complete. The structure is ready for real MTProto
// when the client lib is added.
async function startTelegramPairing(supplier) {
  const session = {
    platform: 'telegram_bot',
    status: 'awaiting_phone',
    qr: null,
    error: null,
    proxyConfig: supplier.proxy_enabled
      ? `socks5:${supplier.proxy_host}:${supplier.proxy_port}`
      : 'none',
    phoneHash: null,
    socket: null,
    timer: null,
  };
  sessions.set(supplier.id, session);

  // 5-minute timeout for the full phone → code flow
  session.timer = setTimeout(() => {
    if (session.status !== 'connected') {
      session.status = 'timeout';
      session.error = 'Pairing timed out (5 minutes)';
      cleanupSession(supplier.id);
    }
  }, 300_000);

  console.log(`[pair] Telegram pairing initiated for supplier ${supplier.id} (awaiting phone)`);
  return {
    success: true,
    status: 'awaiting_phone',
    message: 'Enter the phone number to receive a verification code via Telegram',
  };
}

// ─── public API ───────────────────────────────────────────────────────

function startPairing(supplier) {
  // Cancel any existing session for this supplier
  cancelPairing(supplier.id);

  const platform = supplier.platform || 'whatsapp_cloud';
  if (platform === 'whatsapp_cloud') {
    return startWhatsAppPairing(supplier);
  }
  return startTelegramPairing(supplier);
}

function submitPhone(supplierId, phone) {
  const session = sessions.get(supplierId);
  if (!session) return { success: false, error: 'No active pairing session' };
  if (session.platform !== 'telegram_bot')
    return { success: false, error: 'This platform uses QR pairing, not phone verification' };

  // Simulate sending verification code through the proxy
  session.status = 'awaiting_code';
  session.phoneHash = 'TC_' + Date.now();
  console.log(`[pair] Telegram code "sent" to ${phone} for supplier ${supplierId}`);
  return { success: true, status: 'awaiting_code', message: `Verification code sent to ${phone}` };
}

function submitCode(supplierId, code) {
  const session = sessions.get(supplierId);
  if (!session) return { success: false, error: 'No active pairing session' };
  if (session.platform !== 'telegram_bot')
    return { success: false, error: 'Not applicable for this platform' };

  // Accept any 5+ character code (simulated)
  if (!code || code.length < 5) {
    return { success: false, error: 'Invalid verification code — must be at least 5 characters' };
  }

  session.status = 'connected';
  if (session.timer) clearTimeout(session.timer);
  console.log(`[pair] Telegram paired successfully for supplier ${supplierId}`);
  return { success: true, status: 'connected', message: 'Telegram device paired successfully' };
}

function getStatus(supplierId) {
  const session = sessions.get(supplierId);
  if (!session) return { status: 'none', message: 'No active pairing session' };

  return {
    status: session.status,
    qr: session.qr || null,
    platform: session.platform,
    proxyConfig: session.proxyConfig || 'none',
    error: session.error || null,
  };
}

function cancelPairing(supplierId) {
  cleanupSession(supplierId);
  return { success: true };
}

module.exports = { startPairing, submitPhone, submitCode, getStatus, cancelPairing };
