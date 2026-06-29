// ====================================================================
// teamsService.cjs — Microsoft Teams auto-posting via Workflows webhook
// ====================================================================
// Posts messages to a Teams channel using the Workflows app (Power Automate)
// webhook URL. Supports both simple text and Adaptive Card payloads.
//
// Configuration is stored in platform_settings table:
//   teams_webhook_url   - The Workflows webhook URL
//   teams_enabled       - true/false
//   teams_events        - JSON object with event toggle flags
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
    console.warn('[teams] Neither global fetch nor node-fetch available — Teams posting disabled');
    return null;
  }
}

/**
 * Load Teams configuration from platform_settings.
 */
async function getConfig() {
  if (!_pool) return { enabled: false };
  if (_configCache && Date.now() < _configCacheExpiry) return _configCache;
  try {
    const r = await _pool.query(
      "SELECT key, value FROM platform_settings WHERE key IN ('teams_webhook_url','teams_enabled','teams_events')"
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
    try { if (map.teams_events) events = { ...events, ...JSON.parse(map.teams_events) }; } catch {}

    const result = {
      enabled: map.teams_enabled === 'true',
      webhookUrl: map.teams_webhook_url || '',
      events,
    };
    _configCache = result;
    _configCacheExpiry = Date.now() + CONFIG_CACHE_TTL_MS;
    return result;
  } catch (e) {
    console.error('[teams] Failed to load config:', e.message);
    return { enabled: false };
  }
}

/** Invalidate the config cache (called after config save). */
function invalidateConfig() {
  _configCache = null;
  _configCacheExpiry = 0;
}

/**
 * Check if a specific event type is enabled for Teams posting.
 */
async function isEventEnabled(eventName) {
  const cfg = await getConfig();
  return cfg.enabled && cfg.webhookUrl && cfg.events[eventName] !== false;
}

/**
 * Post a simple text message to Teams.
 */
async function postText(text) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.webhookUrl) return { success: false, message: 'Teams webhook not configured' };

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
      console.error('[teams] POST failed:', status, body.substring(0, 200));
      return { success: false, message: `HTTP ${status}: ${body.substring(0, 200)}` };
    }
    console.log('[teams] Message posted successfully');
    return { success: true, message: 'Posted to Teams' };
  } catch (e) {
    console.error('[teams] POST error:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Post an Adaptive Card to Teams.
 */
async function postAdaptiveCard(card) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.webhookUrl) return { success: false, message: 'Teams webhook not configured' };

  const fetchFn = getFetch();
  if (!fetchFn) return { success: false, message: 'Fetch not available' };

  const payload = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        body: card.body || [],
        actions: card.actions || [],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.5',
      },
    }],
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
      console.error('[teams] Adaptive Card POST failed:', status, body.substring(0, 200));
      return { success: false, message: `HTTP ${status}: ${body.substring(0, 200)}` };
    }
    console.log('[teams] Adaptive Card posted successfully');
    return { success: true, message: 'Posted to Teams' };
  } catch (e) {
    console.error('[teams] Adaptive Card POST error:', e.message);
    return { success: false, message: e.message };
  }
}

// =====================================================================
// HIGH-LEVEL NOTIFICATION HELPERS — called by notification flows
// =====================================================================

/**
 * Post a DLR failure alert to Teams.
 */
async function notifyDlrFailure(consecutiveFailures, supplierName) {
  if (!(await isEventEnabled('dlr_failure'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '🚨 DLR Failure Alert', color: 'Attention' },
      { type: 'TextBlock', text: `**${consecutiveFailures}** consecutive SMS delivery failures detected.` },
      { type: 'TextBlock', text: supplierName ? `Affected supplier: **${supplierName}**` : 'Check supplier bind status and routing.', spacing: 'None' },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
}

/**
 * Post a low balance alert to Teams.
 */
async function notifyLowBalance(clientName, clientCode, balance) {
  if (!(await isEventEnabled('low_balance'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '💰 Low Balance Alert', color: 'Warning' },
      { type: 'TextBlock', text: `**${clientName}** (${clientCode}) balance is critically low.` },
      { type: 'TextBlock', text: `Current balance: **€${Number(balance).toFixed(2)}**`, spacing: 'None' },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
}

/**
 * Post a rate change notification to Teams.
 */
async function notifyRateChange(entityType, entityName, destination, oldRate, newRate, effectiveDate) {
  if (!(await isEventEnabled('rate_change'))) return;
  const dir = oldRate === 0 ? 'New Rate' : newRate > oldRate ? '📈 Increase' : '📉 Decrease';
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: `💱 Rate Change — ${dir}` },
      { type: 'TextBlock', text: `**${entityName}** (${entityType}) — ${destination}` },
      { type: 'FactSet', facts: [
        { title: 'Old Rate', value: oldRate > 0 ? `€${oldRate.toFixed(4)}` : 'N/A' },
        { title: 'New Rate', value: `€${newRate.toFixed(4)}` },
        { title: 'Effective', value: effectiveDate || 'Immediate' },
      ]},
    ],
  });
}

/**
 * Post a new client notification to Teams.
 */
async function notifyNewClient(clientName, clientCode) {
  if (!(await isEventEnabled('new_client'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '👤 New Client Created' },
      { type: 'TextBlock', text: `**${clientName}** (${clientCode}) has been registered.` },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
}

/**
 * Post a supplier disconnect alert to Teams.
 */
async function notifySupplierDisconnect(supplierName, supplierCode, failureCount) {
  if (!(await isEventEnabled('supplier_disconnect'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '📡 Supplier Disconnected', color: 'Attention' },
      { type: 'TextBlock', text: `**${supplierName}** (${supplierCode}) has been disconnected.` },
      { type: 'TextBlock', text: `Consecutive failures: **${failureCount}**`, spacing: 'None' },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
}

/**
 * Post an invoice generated notification to Teams.
 */
async function notifyInvoiceGenerated(invoiceNumber, entityName, amount) {
  if (!(await isEventEnabled('invoice_generated'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '📄 Invoice Generated' },
      { type: 'TextBlock', text: `Invoice **${invoiceNumber}** for **${entityName}**.` },
      { type: 'TextBlock', text: `Amount: **€${Number(amount).toLocaleString()}**`, spacing: 'None' },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
}

/**
 * Post a payment received notification to Teams.
 */
async function notifyPaymentReceived(entityName, amount, method) {
  if (!(await isEventEnabled('payment_received'))) return;
  await postAdaptiveCard({
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '✅ Payment Received', color: 'Good' },
      { type: 'TextBlock', text: `**€${Number(amount).toLocaleString()}** received from **${entityName}**.` },
      { type: 'TextBlock', text: `Method: ${method}`, spacing: 'None' },
      { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
    ],
  });
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
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            body: [
              { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '✅ NET2APP Hub — Teams Integration Test' },
              { type: 'TextBlock', text: 'If you see this message, the webhook is working correctly!' },
              { type: 'TextBlock', text: `⏰ ${new Date().toLocaleString()}`, color: 'Light', spacing: 'None' },
            ],
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.5',
          },
        }],
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
  postAdaptiveCard,
  notifyDlrFailure,
  notifyLowBalance,
  notifyRateChange,
  notifyNewClient,
  notifySupplierDisconnect,
  notifyInvoiceGenerated,
  notifyPaymentReceived,
  testWebhook,
};
