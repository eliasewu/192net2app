// ====================================================================
// slackService.cjs — Slack auto-posting via Incoming Webhooks
// ====================================================================
// Posts messages to a Slack channel using an Incoming Webhook URL.
// Supports both plain text and Block Kit rich messages.
//
// Configuration is stored in platform_settings table:
//   slack_webhook_url   - The Incoming Webhook URL
//   slack_enabled       - true/false
//   slack_events        - JSON object with event toggle flags
// ====================================================================

let _pool = null;
let _fetch = null;
let _configCache = null;
let _configCacheExpiry = 0;
const CONFIG_CACHE_TTL_MS = 60_000; // 60 seconds

function setPool(pool) {
  _pool = pool;
}

/**
 * Lazy-load node fetch (built-in in Node 18+, fallback to node-fetch).
 */
function getFetch() {
  if (_fetch) return _fetch;
  if (typeof globalThis.fetch === 'function') {
    _fetch = globalThis.fetch;
    return _fetch;
  }
  try {
    _fetch = require('node-fetch');
    return _fetch;
  } catch {
    console.warn('[slack] Neither global fetch nor node-fetch available — Slack posting disabled');
    return null;
  }
}

/**
 * Load Slack configuration from platform_settings.
 */
async function getConfig() {
  if (!_pool) return { enabled: false };
  if (_configCache && Date.now() < _configCacheExpiry) return _configCache;
  try {
    const r = await _pool.query(
      "SELECT key, value FROM platform_settings WHERE key IN ('slack_webhook_url','slack_enabled','slack_events')"
    );
    const map = {};
    for (const row of r.rows) map[row.key] = row.value;

    let events = {
      dlr_failure: true,
      low_balance: true,
      rate_change: true,
      new_client: true,
      supplier_disconnect: true,
      invoice_generated: true,
      payment_received: true,
    };
    try { if (map.slack_events) events = { ...events, ...JSON.parse(map.slack_events) }; } catch {}

    const result = {
      enabled: map.slack_enabled === 'true',
      webhookUrl: map.slack_webhook_url || '',
      events,
    };
    _configCache = result;
    _configCacheExpiry = Date.now() + CONFIG_CACHE_TTL_MS;
    return result;
  } catch (e) {
    console.error('[slack] Failed to load config:', e.message);
    return { enabled: false };
  }
}

/** Invalidate the config cache (called after config save). */
function invalidateConfig() {
  _configCache = null;
  _configCacheExpiry = 0;
}

/**
 * Check if a specific event type is enabled for Slack posting.
 */
async function isEventEnabled(eventName) {
  const cfg = await getConfig();
  return cfg.enabled && cfg.webhookUrl && cfg.events[eventName] !== false;
}

/**
 * Post a simple text message to Slack.
 */
async function postText(text) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.webhookUrl) return { success: false, message: 'Slack webhook not configured' };

  const fetchFn = getFetch();
  if (!fetchFn) return { success: false, message: 'Fetch not available' };

  try {
    const resp = await fetchFn(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const ok = resp.ok;
    const status = resp.status;
    if (!ok) {
      const body = await resp.text().catch(() => '');
      console.error('[slack] POST failed:', status, body.substring(0, 200));
      return { success: false, message: `HTTP ${status}: ${body.substring(0, 200)}` };
    }
    console.log('[slack] Message posted successfully');
    return { success: true, message: 'Posted to Slack' };
  } catch (e) {
    console.error('[slack] POST error:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Post a Block Kit message to Slack.
 */
async function postBlocks(blocks) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.webhookUrl) return { success: false, message: 'Slack webhook not configured' };

  const fetchFn = getFetch();
  if (!fetchFn) return { success: false, message: 'Fetch not available' };

  const payload = {
    blocks: blocks || [],
  };

  try {
    const resp = await fetchFn(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const ok = resp.ok;
    const status = resp.status;
    if (!ok) {
      const body = await resp.text().catch(() => '');
      console.error('[slack] Block Kit POST failed:', status, body.substring(0, 200));
      return { success: false, message: `HTTP ${status}: ${body.substring(0, 200)}` };
    }
    console.log('[slack] Block Kit message posted successfully');
    return { success: true, message: 'Posted to Slack' };
  } catch (e) {
    console.error('[slack] Block Kit POST error:', e.message);
    return { success: false, message: e.message };
  }
}

// =====================================================================
// HIGH-LEVEL NOTIFICATION HELPERS — called by notification flows
// =====================================================================

/**
 * Post a DLR failure alert to Slack.
 */
async function notifyDlrFailure(consecutiveFailures, supplierName) {
  if (!(await isEventEnabled('dlr_failure'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '🚨 DLR Failure Alert', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${consecutiveFailures}* consecutive SMS delivery failures detected.\n${supplierName ? `Affected supplier: *${supplierName}*` : 'Check supplier bind status and routing.'}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post a low balance alert to Slack.
 */
async function notifyLowBalance(clientName, clientCode, balance) {
  if (!(await isEventEnabled('low_balance'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '💰 Low Balance Alert', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${clientName}* (${clientCode}) balance is critically low.\nCurrent balance: *€${Number(balance).toFixed(2)}*` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post a rate change notification to Slack.
 */
async function notifyRateChange(entityType, entityName, destination, oldRate, newRate, effectiveDate) {
  if (!(await isEventEnabled('rate_change'))) return;
  const dir = oldRate === 0 ? 'New Rate' : newRate > oldRate ? '📈 Increase' : '📉 Decrease';
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: `💱 Rate Change — ${dir}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${entityName}* (${entityType}) — ${destination}` } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Old Rate:*\n${oldRate > 0 ? '€' + oldRate.toFixed(4) : 'N/A'}` },
      { type: 'mrkdwn', text: `*New Rate:*\n€${newRate.toFixed(4)}` },
      { type: 'mrkdwn', text: `*Effective:*\n${effectiveDate || 'Immediate'}` },
    ]},
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post a new client notification to Slack.
 */
async function notifyNewClient(clientName, clientCode) {
  if (!(await isEventEnabled('new_client'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '👤 New Client Created', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${clientName}* (${clientCode}) has been registered.` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post a supplier disconnect alert to Slack.
 */
async function notifySupplierDisconnect(supplierName, supplierCode, failureCount) {
  if (!(await isEventEnabled('supplier_disconnect'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '📡 Supplier Disconnected', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${supplierName}* (${supplierCode}) has been disconnected.\nConsecutive failures: *${failureCount}*` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post an invoice generated notification to Slack.
 */
async function notifyInvoiceGenerated(invoiceNumber, entityName, amount) {
  if (!(await isEventEnabled('invoice_generated'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '📄 Invoice Generated', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `Invoice *${invoiceNumber}* for *${entityName}*.\nAmount: *€${Number(amount).toLocaleString()}*` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Post a payment received notification to Slack.
 */
async function notifyPaymentReceived(entityName, amount, method) {
  if (!(await isEventEnabled('payment_received'))) return;
  await postBlocks([
    { type: 'header', text: { type: 'plain_text', text: '✅ Payment Received', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*€${Number(amount).toLocaleString()}* received from *${entityName}*.\nMethod: ${method}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
  ]);
}

/**
 * Test the webhook connection by sending a test message.
 */
async function testWebhook(webhookUrl) {
  const fetchFn = getFetch();
  if (!fetchFn) return { success: false, message: 'Fetch not available' };

  const url = webhookUrl;
  if (!url) return { success: false, message: 'No webhook URL provided' };

  try {
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '✅ NET2APP Hub — Slack Integration Test', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: 'If you see this message, the webhook is working correctly!' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `⏰ ${new Date().toLocaleString()}` }] },
        ],
      }),
    });
    const ok = resp.ok;
    const status = resp.status;
    if (!ok) {
      const body = await resp.text().catch(() => '');
      return { success: false, message: `HTTP ${status}: ${body.substring(0, 200)}` };
    }
    return { success: true, message: 'Test message sent successfully!' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

module.exports = {
  setPool,
  getConfig,
  invalidateConfig,
  isEventEnabled,
  postText,
  postBlocks,
  notifyDlrFailure,
  notifyLowBalance,
  notifyRateChange,
  notifyNewClient,
  notifySupplierDisconnect,
  notifyInvoiceGenerated,
  notifyPaymentReceived,
  testWebhook,
};
