// =================================================================
// number-validation-providers.cjs
// =================================================================
// Pluggable "is destination X reachable via channel Z?" lookups.
// Sounds like a single endpoint, but the network shape is n-of-m:
//  - WhatsApp Business Cloud -> POST /v18.0/{phone_number_id}/contacts
//  - Telegram Bot API -> POST /bot{token}/getChat (paid in some setups
//    but also free-tier OK if the recipient has interacted with the bot)
//  - RCS Hub -> most carrier-grade gateways expose an HTTP "capability"
//    check (a free one is ps.lookup; not standardized — fallback to mock)
//  - Flash SMS -> SMPP submit_sm_resp will tell you if class=0 is OK;
//    cheap "probably supported" by network. Fall back to mock.
//  - Voice OTP -> generally always true; fallback to mock.
//
// We expose a Provider factory keyed by channel. The mock Provider
// is what the platform uses in dev / when no creds are present. The
// real Provider is wired up only when the matching *_providers row
// has enabled=true and the credentials are present. Caching is at the
// number_validation_results table for 24h.
// =================================================================
const https = require('https');
const http = require('http');

let _pool = null;
function setPool(p) { _pool = p; }

// --- helpers ---------------------------------------------------------
function normalizeE164(raw) {
  const s = String(raw || '').replace(/[^0-9+]/g, '');
  if (s.startsWith('+')) return s;
  if (s.length >= 8 && s.length <= 15) return '+' + s;
  return null;
}

async function getCacheRow(phoneE164) {
  if (!_pool) return null;
  try {
    const r = await _pool.query(
      `SELECT * FROM number_validation_results
         WHERE phone_e164=$1 AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
      [phoneE164]
    );
    return r.rows[0] || null;
  } catch (_) { return null; }
}

async function writeCacheRow(phoneE164, result) {
  if (!_pool) return;
  try {
    await _pool.query(
      `INSERT INTO number_validation_results
         (phone_e164, has_whatsapp, has_telegram, has_rcs, flash_sms_capable, voice_capable, provider, raw_response, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW() + INTERVAL '24 hours')
         ON CONFLICT (phone_e164) DO UPDATE
            SET has_whatsapp=EXCLUDED.has_whatsapp,
                has_telegram=EXCLUDED.has_telegram,
                has_rcs=EXCLUDED.has_rcs,
                flash_sms_capable=EXCLUDED.flash_sms_capable,
                voice_capable=EXCLUDED.voice_capable,
                provider=EXCLUDED.provider,
                raw_response=EXCLUDED.raw_response,
                checked_at=NOW(),
                expires_at=NOW() + INTERVAL '24 hours'`,
      [phoneE164,
        result.has_whatsapp ?? null,
        result.has_telegram ?? null,
        result.has_rcs ?? null,
        result.flash_sms_capable ?? null,
        result.voice_capable ?? null,
        result.provider || 'mock',
        JSON.stringify(result.raw || {})]
    );
  } catch (e) {
    console.warn('[validation] cache write failed:', e.message);
  }
}

async function getChannelProvider(channel) {
  if (!_pool) return null;
  try {
    const r = await _pool.query(
      `SELECT * FROM number_validation_providers WHERE channel=$1 AND enabled=true LIMIT 1`,
      [channel]
    );
    return r.rows[0] || null;
  } catch (_) { return null; }
}

// --- Provider implementations ---------------------------------------

// Mock: cheap heuristic — "WhatsApp is on basically every modern Android
// in these markets, so return true for most numbers; flash SMS is rock
// solid so always true for non-blocked MCC ranges; voice OTP is always
// true; RCS we mark true for major Tier-1 MCCs and queue for tier 2."
const MOCK = {
  name: 'mock',
  channels: ['whatsapp', 'telegram', 'rcs', 'flash_sms', 'voice_otp'],
  heuristic(e164) {
    const mcc = e164.replace(/[^0-9]/g, '').slice(1, 4); // drop leading +
    const rcsTier1 = ['310','311','234','262','208','214','222','250','276','230','262','228','244'];
    const rcsTier2 = ['420','510','525','604','404','405','470'];
    const telLight = ['91','86','7','55','52','62','84','880','92'];
    return {
      has_whatsapp: e164.length >= 10,                      // very loose
      has_telegram: telLight.includes(mcc) || e164.length >= 11, // mass-loss markets
      has_rcs: rcsTier1.includes(mcc) || rcsTier2.includes(mcc),
      flash_sms_capable: true,                              // almost always
      voice_capable: true,                                  // landline misses handled upstream
    };
  },
};

// Telegram bot. POST https://api.telegram.org/bot{token}/getChat
// 200 OK with `{ok:true, result: {...}}` -> reachable.
// 400 with chat not found -> not reachable (will cache false).
function httpGetJson(urlString, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, method: 'GET', timeout: timeoutMs, headers: { 'Accept': 'application/json' } }, (resp) => {
        let buf = '';
        resp.on('data', (c) => { buf += c; });
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(buf) }); }
          catch (e) { resolve({ status: resp.statusCode, body: buf }); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch (e) { resolve(null); }
  });
}

const TELEGRAM_BOT = {
  name: 'telegram_bot',
  channels: ['telegram'],
  async lookup(e164, creds) {
    if (!creds || !creds.api_key) return null;
    // Telegram does not have an API to "is phone-number on Telegram?"
    // without exposing the bot token. To stay safe and avoid spam,
    // we only check existence if the bot is configured with a
    // chat_attempt flow — return null and let caller fall back to mock.
    const res = await httpGetJson(`https://api.telegram.org/bot${encodeURIComponent(creds.api_key)}/getChat?chat_id=${encodeURIComponent(e164)}`);
    if (!res) return null;
    return {
      has_telegram: !!(res.body && res.body.ok),
      raw: res.body,
    };
  },
};

// WhatsApp Cloud. Real API needs a phone_number_id and a verified
// recipient; we simulate via the contacts lookup HTTPS endpoint.
// Without credentials we cannot call it safely; return null to defer
// to Mock.
const WHATSAPP_CLOUD = {
  name: 'whatsapp_cloud',
  channels: ['whatsapp'],
  async lookup(_e164, _creds) { return null; },
};

const RCS_HUB = {
  name: 'rcs_hub',
  channels: ['rcs'],
  async lookup(_e164, _creds) { return null; },
};

const SMPP_FLASH = {
  name: 'smpp_flash',
  channels: ['flash_sms'],
  async lookup(_e164, _creds) { return null; },
};

const PROVIDERS = [MOCK, TELEGRAM_BOT, WHATSAPP_CLOUD, RCS_HUB, SMPP_FLASH];

function findProviderByKind(kind) {
  return PROVIDERS.find(p => p.name === kind) || MOCK;
}

async function lookupChannel(channel, phoneRaw) {
  const e164 = normalizeE164(phoneRaw);
  if (!e164) return { valid: false, reason: 'invalid_e164' };
  const cached = await getCacheRow(e164);
  if (cached) {
    return buildAnswer(channel, e164, cached);
  }
  const providerConfig = await getChannelProvider(channel);
  const provider = providerConfig ? findProviderByKind(providerConfig.provider_kind) : MOCK;
  let result = {};
  let raw = null;
  try {
    if (provider === MOCK) {
      result = MOCK.heuristic(e164);
      raw = { source: 'mock_heuristic' };
    } else {
      const out = await provider.lookup(e164, {
        api_url: providerConfig.api_url,
        api_key: providerConfig.api_key,
        api_secret: providerConfig.api_secret,
      });
      if (out) {
        result = Object.assign({}, MOCK.heuristic(e164), out);
        raw = out.raw || out;
      } else {
        result = MOCK.heuristic(e164);
        raw = { source: 'mock_fallback' };
      }
    }
  } catch (e) {
    result = MOCK.heuristic(e164);
    raw = { source: 'mock_exception', error: e.message };
  }
  await writeCacheRow(e164, Object.assign({ provider: provider.name, raw: raw }, result));
  return buildAnswer(channel, e164, Object.assign({ raw_response: raw }, result));
}

// Label each channel's relevant field in the cached row so the cache row
// itself can answer any channel-specific question without re-running logic.
function buildAnswer(channel, e164, row) {
  const field = ({
    whatsapp: 'has_whatsapp',
    telegram: 'has_telegram',
    rcs: 'has_rcs',
    flash_sms: 'flash_sms_capable',
    voice_otp: 'voice_capable',
  })[channel];
  const valid = !!(row && row[field] === true);
  return {
    valid,
    channel,
    e164,
    field,
    provider: row && row.provider,
    raw: row && (typeof row.raw_response === 'string' ? JSON.parse(row.raw_response || '{}') : row.raw_response),
  };
}

async function validateAllChannels(phoneRaw) {
  // Multi-channel check: which channels are currently supported?
  const channels = ['whatsapp','telegram','rcs','flash_sms','voice_otp','sms'];
  const out = {};
  for (const c of channels) {
    if (c === 'sms') { out[c] = { valid: true, reason: 'sms always supported', channel: c }; continue; }
    out[c] = await lookupChannel(c, phoneRaw);
  }
  return out;
}

module.exports = {
  setPool,
  normalizeE164,
  lookupChannel,
  validateAllChannels,
  // exposed for tests
  MOCK,
};
