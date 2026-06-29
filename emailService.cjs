// ====================================================================
// emailService.cjs — Real SMTP email sending for notifications
// ====================================================================
// Reads smtp_config from PostgreSQL, creates a nodemailer transporter,
// renders notification_templates, and actually sends emails.
// Previously the backend only inserted notification rows with
// is_emailed=true but never called an SMTP server.
// ====================================================================

let _pool = null;
let _transporter = null;
let _transporterConfigHash = null;
let _cachedFromAddr = 'noreply@net2app.com';
let _cachedFromName = 'NET2APP Hub';

/**
 * Set the PostgreSQL pool. Must be called once by server.cjs after the
 * pool is created.
 */
function setPool(pool) {
  _pool = pool;
}

/**
 * Load the active SMTP config from the database and create/refresh the
 * nodemailer transporter. Safe to call repeatedly — re-creates the
 * transporter only when settings actually change.
 */
async function ensureTransporter() {
  if (!_pool) throw new Error('emailService: pool not set — call setPool(pool) first');

  const r = await _pool.query(
    "SELECT * FROM smtp_config WHERE is_active=true ORDER BY id DESC LIMIT 1"
  );
  if (!r.rows.length) {
    console.warn('[email] No active SMTP config found — email sending disabled');
    _transporter = null;
    _transporterConfigHash = null;
    return null;
  }

  const cfg = r.rows[0];
  const hash = `${cfg.host}:${cfg.port}:${cfg.encryption}:${cfg.username}`;
  if (_transporter && _transporterConfigHash === hash) return _transporter;

  // Require nodemailer lazily so server.cjs can require() this file even
  // before npm install has run (graceful degradation).
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    console.warn('[email] nodemailer not installed — email sending disabled. Run: npm install nodemailer');
    _transporter = null;
    _transporterConfigHash = null;
    return null;
  }

  const transportOpts = {
    host: cfg.host,
    port: parseInt(cfg.port, 10) || 587,
    secure: cfg.encryption === 'ssl',
  };
  // TLS — STARTTLS on port 587 (secure=false), implicit TLS on port 465 (secure=true)
  if (cfg.encryption === 'tls') {
    transportOpts.secure = false;
    transportOpts.requireTLS = true;
  }
  if (cfg.username) {
    transportOpts.auth = { user: cfg.username, pass: cfg.password || '' };
  }

  try {
    _transporter = nodemailer.createTransport(transportOpts);
    _transporterConfigHash = hash;
    _cachedFromAddr = cfg.from_email || 'noreply@net2app.com';
    _cachedFromName = cfg.from_name || 'NET2APP Hub';
    console.log('[email] Transporter created for', cfg.host + ':' + cfg.port,
                '(encryption=' + cfg.encryption + ', user=' + (cfg.username || 'none') + ', from=' + _cachedFromAddr + ')');
    return _transporter;
  } catch (e) {
    console.error('[email] Failed to create transporter:', e.message);
    _transporter = null;
    _transporterConfigHash = null;
    return null;
  }
}

/**
 * Render a notification template by replacing {{variables}} with actual values.
 * @param {string} template - Template string with {{var}} placeholders
 * @param {Record<string,string>} variables - Key-value pairs to substitute
 * @returns {string} Rendered template
 */
function renderTemplate(template, variables) {
  let out = String(template || '');
  for (const [key, value] of Object.entries(variables || {})) {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/\$/g, '$$$$');
    out = out.replaceAll(`{{${key}}}`, escaped);
  }
  // Clean up any remaining unresolved placeholders
  out = out.replace(/\{\{[^}]+\}\}/g, '');
  return out;
}

/**
 * Load a notification template by name from the DB.
 * @param {string} templateName - e.g. 'Rate Change Notice'
 * @returns {{ subject: string, body: string, variables: string[] } | null}
 */
async function loadTemplate(templateName) {
  if (!_pool) return null;
  const r = await _pool.query(
    "SELECT * FROM notification_templates WHERE template_name=$1 AND is_active=true LIMIT 1",
    [templateName]
  );
  return r.rows[0] || null;
}

/**
 * Send a rate change notification email to a client or supplier.
 * Uses the "Rate Change Notice" template from notification_templates.
 *
 * @param {object} opts
 * @param {'client'|'supplier'} opts.entity_type
 * @param {string|number} opts.entity_id
 * @param {string} opts.destination - e.g. "United States - All Operators"
 * @param {number} opts.old_rate
 * @param {number} opts.new_rate
 * @param {string} opts.effective_date
 * @param {string} [opts.operator] - Specific operator name (optional)
 * @returns {Promise<{success:boolean, message:string}>}
 */
async function sendRateChangeEmail(opts) {
  try {
    const transporter = await ensureTransporter();
    if (!transporter) return { success: false, message: 'SMTP not configured' };

    // Look up entity details
    const entR = await _pool.query(
      opts.entity_type === 'client'
        ? 'SELECT company_name, email, client_code, smpp_username FROM clients WHERE id=$1'
        : 'SELECT company_name, email, supplier_code AS client_code, smpp_username FROM suppliers WHERE id=$1',
      [opts.entity_id]
    );
    const ent = entR.rows[0];
    if (!ent) return { success: false, message: 'Entity not found' };
    if (!ent.email) return { success: false, message: 'Entity has no email' };

    // Load the Rate Change Notice template
    const tpl = await loadTemplate('Rate Change Notice');
    const destLabel = opts.operator && opts.operator !== 'All'
      ? `${opts.destination} - ${opts.operator}`
      : opts.destination;

    const variables = {
      entity_name: ent.company_name || 'Unknown',
      entity_code: ent.client_code || String(opts.entity_id),
      smpp_username: ent.smpp_username || 'N/A',
      destination: destLabel,
      old_rate: `€${Number(opts.old_rate).toFixed(4)}`,
      new_rate: `€${Number(opts.new_rate).toFixed(4)}`,
      effective_date: opts.effective_date || new Date().toISOString().split('T')[0],
    };

    const subject = tpl ? renderTemplate(tpl.subject, variables) : `Rate Update Notice — ${destLabel}`;
    const body = tpl ? renderTemplate(tpl.body, variables) : `Dear ${variables.entity_name},\n\nRate change: ${variables.destination}\nOld: ${variables.old_rate}\nNew: ${variables.new_rate}\nEffective: ${variables.effective_date}\n\nNET2APP Hub`;

    const mailOpts = {
      from: _cachedFromName ? `"${_cachedFromName}" <${_cachedFromAddr}>` : _cachedFromAddr,
      to: ent.email,
      subject,
      text: body,
    };

    const info = await transporter.sendMail(mailOpts);
    console.log('[email] Rate change email sent to', ent.email, '— messageId:', info.messageId);

    // Record the notification in the DB
    await _pool.query(
      `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
       VALUES ($1, $2, 'info', $3, $4, $5, $6, false, true)`,
      [subject.substring(0, 255), body.substring(0, 4000), opts.entity_type, ent.company_name, opts.entity_id, ent.email]
    );

    return { success: true, message: 'Email sent to ' + ent.email, messageId: info.messageId };
  } catch (e) {
    console.error('[email] sendRateChangeEmail failed:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Send a generic notification email using any template.
 * @param {object} opts
 * @param {string} opts.template_name - Template name in notification_templates
 * @param {Record<string,string>} opts.variables - Template variables
 * @param {string[]} opts.recipients - Email addresses
 * @returns {Promise<{success:boolean, message:string, results:Array}>}
 */
async function sendNotificationEmail(opts) {
  const results = [];
  try {
    const transporter = await ensureTransporter();
    if (!transporter) return { success: false, message: 'SMTP not configured', results };

    const tpl = await loadTemplate(opts.template_name);
    if (!tpl) return { success: false, message: 'Template not found: ' + opts.template_name, results };

    const subject = renderTemplate(tpl.subject, opts.variables || {});
    const body = renderTemplate(tpl.body, opts.variables || {});

    for (const recipient of (opts.recipients || [])) {
      try {
        const info = await transporter.sendMail({
          from: _cachedFromName ? `"${_cachedFromName}" <${_cachedFromAddr}>` : _cachedFromAddr,
          to: recipient,
          subject,
          text: body,
        });
        results.push({ email: recipient, sent: true, messageId: info.messageId });

        // Record notification in DB
        await _pool.query(
          `INSERT INTO notifications (title, message, type, recipient_email, is_read, is_emailed)
           VALUES ($1, $2, 'info', $3, false, true)`,
          [subject.substring(0, 255), body.substring(0, 4000), recipient]
        );
      } catch (e) {
        results.push({ email: recipient, sent: false, error: e.message });
      }
    }
    return { success: results.some(r => r.sent), message: `${results.filter(r => r.sent).length}/${results.length} sent`, results };
  } catch (e) {
    console.error('[email] sendNotificationEmail failed:', e.message);
    return { success: false, message: e.message, results };
  }
}

/**
 * Test the SMTP connection and return diagnostic info.
 * @returns {Promise<{success:boolean, message:string, details?: object}>}
 */
async function testSmtpConnection() {
  try {
    if (!_pool) return { success: false, message: 'Database pool not set' };

    const cfgR = await _pool.query("SELECT * FROM smtp_config WHERE is_active=true ORDER BY id DESC LIMIT 1");
    if (!cfgR.rows.length) return { success: false, message: 'No active SMTP config' };

    const transporter = await ensureTransporter();
    if (!transporter) return { success: false, message: 'Failed to create transporter' };

    const cfg = cfgR.rows[0];

    // Verify connection
    const verified = await transporter.verify();
    console.log('[email] SMTP test connection succeeded:', verified);

    // Update test_status in DB
    await _pool.query(
      "UPDATE smtp_config SET test_status='success', updated_at=NOW() WHERE id=$1",
      [cfg.id]
    );

    return {
      success: true,
      message: 'SMTP connection successful',
      details: {
        host: cfg.host,
        port: cfg.port,
        encryption: cfg.encryption,
        username: cfg.username || '(none)',
        from_email: cfg.from_email || '(not set)',
        verified,
      },
    };
  } catch (e) {
    console.error('[email] SMTP test failed:', e.message);

    // Update test_status
    try {
      const cfgR = await _pool.query("SELECT id FROM smtp_config WHERE is_active=true ORDER BY id DESC LIMIT 1");
      if (cfgR.rows.length) {
        await _pool.query(
          "UPDATE smtp_config SET test_status='failed', updated_at=NOW() WHERE id=$1",
          [cfgR.rows[0].id]
        );
      }
    } catch (_) {}

    return { success: false, message: 'SMTP test failed: ' + e.message };
  }
}

module.exports = {
  setPool,
  ensureTransporter,
  renderTemplate,
  loadTemplate,
  sendRateChangeEmail,
  sendNotificationEmail,
  testSmtpConnection,
};
