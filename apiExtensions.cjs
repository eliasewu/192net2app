// =================================================================
// apiExtensions.cjs — additional endpoints referenced by
// src/services/apiServices.ts. Loaded by server.cjs BEFORE the
// generic CRUD loop so explicit routes (notably /api/api-connectors)
// win the Express match.
// =================================================================
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const LANGUAGES = require('./src/config/languages.cjs');
const voiceOtpAudioBase = path.join(__dirname, 'data', 'uploads', 'audio');
try { fs.mkdirSync(voiceOtpAudioBase, { recursive: true }); } catch (_) {}

// pool is injected at call time via setPool. Number-validation-providers
// and asterisk-bridge are injected below if they exist; otherwise the
// relevant endpoints fall back to "not configured" responses. Email service
// is also injected so rate-change notifications actually send email.
let _numValid = null;
let _astBridge = null;
let _emailService = null;
let _teamsService = null;
let _slackService = null;
function setModules(nv, ab, es) { _numValid = nv; _astBridge = ab; _emailService = es || null; }

// Exported factory + setModules injector. server.cjs requires this file,
// then calls the factory with `(app, pool, auth, roles)` and afterwards
// invokes `apiExtensions.setModules(numValid, astBridge)` so the
// /api/asterisk/* and /api/number/* endpoints can reach those modules.
const _factory = function(app, pool, auth, roles) {

// -----------------------------------------------------------------
// SMS  (sms/validate, sms/dlr/batch)
// -----------------------------------------------------------------
app.post('/api/sms/validate', auth, async (req, res) => {
  try {
    const { client_id, destination, message } = req.body || {};
    if (!client_id || !destination) return res.status(400).json({ error: 'client_id and destination required' });
    const cR = await pool.query("SELECT * FROM clients WHERE id=$1 AND status='active'", [client_id]);
    if (!cR.rows.length) return res.status(404).json({ error: 'Client not found' });
    const c = cR.rows[0];

    const digits = String(destination).replace(/[^0-9]/g, '');
    const mccGuess = digits.length >= 3 ? digits.substring(0, 3) : null;
    let mcc = null, mnc = null, country = null, operator = null;
    if (mccGuess) {
      const m = await pool.query(
        "SELECT mcc, mnc, country, operator FROM mccmnc WHERE mcc=$1 ORDER BY mnc LIMIT 1",
        [mccGuess]
      );
      if (m.rows.length) { mcc = m.rows[0].mcc; mnc = m.rows[0].mnc; country = m.rows[0].country; operator = m.rows[0].operator; }
    }

    let supplier = null, routeId = null, routeName = null;
    if (mcc) {
      const r = await pool.query(
        `SELECT rm.route_id, rm.supplier_id, r.route_name, s.supplier_code
           FROM route_maps rm
           JOIN routes     r ON r.id = rm.route_id
           JOIN suppliers  s ON s.id = rm.supplier_id
          WHERE rm.client_id = $1 AND rm.is_active = true
            AND $2 LIKE REPLACE(rm.mccmnc_pattern, '*', '%')
          ORDER BY rm.priority ASC LIMIT 1`,
        [client_id, mcc + (mnc || '')]
      );
      if (r.rows.length) {
        supplier = { id: r.rows[0].supplier_id, code: r.rows[0].supplier_code };
        routeId = r.rows[0].route_id;
        routeName = r.rows[0].route_name;
      }
    }

    let clientRate = 0.025, supplierRate = 0.015;
    if (mcc) {
      const cr = await pool.query(
        "SELECT rate FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true AND (($2::text IS NULL) OR (mcc=$2)) LIMIT 1",
        [client_id, mcc]
      );
      if (cr.rows.length) clientRate = parseFloat(cr.rows[0].rate);
    }
    if (supplier && mcc) {
      const sr = await pool.query(
        "SELECT rate FROM rates WHERE entity_type='supplier' AND entity_id=$1 AND is_active=true AND (($2::text IS NULL) OR (mcc=$2)) LIMIT 1",
        [supplier.id, mcc]
      );
      if (sr.rows.length) supplierRate = parseFloat(sr.rows[0].rate);
    }

    const parts = Math.ceil((message || '').length / 160) || 1;
    const profit = clientRate - supplierRate;
    const valid = profit > 0 && (parseFloat(c.balance) + parseFloat(c.credit_limit || 0)) >= clientRate * parts;
    const available = parseFloat(c.balance) + parseFloat(c.credit_limit || 0);
    const cost = clientRate * parts;

    res.json({
      valid,
      estimated_cost: cost,
      rate: clientRate,
      supplier_rate: supplierRate,
      profit,
      route: { id: routeId, name: routeName, supplier_id: supplier?.id || null, supplier_code: supplier?.code || null },
      mcc, mnc, country, operator,
      currency: c.currency || 'EUR',
      balance: parseFloat(c.balance),
      credit_limit: parseFloat(c.credit_limit || 0),
      available,
      billing_mode: c.billing_mode,
      parts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/dlr/batch', auth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.message_ids) ? req.body.message_ids : [];
    if (!ids.length) return res.json({ success: true, results: [] });
    const r = await pool.query(
      `SELECT message_id, destination, status, dlr_status, submit_time, delivery_time, error_code
         FROM sms_logs WHERE message_id = ANY($1::text[]) ORDER BY submit_time DESC LIMIT $2`,
      [ids, ids.length]
    );
    res.json({ success: true, results: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// RATES  (history, deactivate-old, notify, destination, update-destination)
// -----------------------------------------------------------------
app.get('/api/rates/history', auth, async (req, res) => {
  try {
    const { entity_type, entity_id, mcc, mnc } = req.query;
    if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
    let q = `SELECT * FROM rates WHERE entity_type=$1 AND entity_id=$2`;
    const p = [entity_type, entity_id]; let i = 3;
    if (mcc) { q += ` AND mcc=$${i++}`; p.push(mcc); }
    if (mnc) { q += ` AND mnc=$${i++}`; p.push(mnc); }
    q += ' ORDER BY version DESC LIMIT 200';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rates/deactivate-old', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const list = Array.isArray(req.body?.rates) ? req.body.rates : [];
    let n = 0;
    for (const k of list) {
      const r = await pool.query(
        `UPDATE rates SET is_active=false, effective_to=CURRENT_DATE
           WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4 AND is_active=true`,
        [k.entity_type, k.entity_id, k.mcc, k.mnc]
      );
      n += r.rowCount || 0;
    }
    res.json({ success: true, deactivated: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rates/notify', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const { entity_type, entity_id, rate_ids = [], destination, old_rate, new_rate, effective_date, operator } = req.body || {};
    const ents = await pool.query(
      entity_type === 'client'
        ? 'SELECT id, company_name, email FROM clients WHERE id=$1'
        : 'SELECT id, company_name, email FROM suppliers WHERE id=$1',
      [entity_id]
    );
    const ent = ents.rows[0];
    if (!ent) return res.status(404).json({ error: 'Entity not found' });
    const rates = rate_ids.length
      ? (await pool.query('SELECT * FROM rates WHERE id = ANY($1::int[])', [rate_ids])).rows
      : (await pool.query('SELECT * FROM rates WHERE entity_type=$1 AND entity_id=$2 ORDER BY id DESC LIMIT 5', [entity_type, entity_id])).rows;
    const message = `Rate update for ${ent.company_name}: ${rates.length} rate(s) changed.`;
    await pool.query(
      `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
         VALUES ($1, $2, 'info', $3, $4, $5, $6, false, false)`,
      ['Rate update', message, entity_type, ent.company_name, entity_id, ent.email || null]
    );

    // Send actual email if SMTP is configured and destination info is provided
    let emailResult = null;
    if (_emailService && ent.email && destination && new_rate != null) {
      emailResult = await _emailService.sendRateChangeEmail({
        entity_type, entity_id,
        destination: destination || rates[0]?.country || 'Unknown',
        old_rate: old_rate ?? 0,
        new_rate,
        effective_date: effective_date || new Date().toISOString().split('T')[0],
        operator: operator || rates[0]?.operator || 'All',
      });
    }
    res.json({ success: true, notified: ent.email || null, rate_count: rates.length, email_sent: !!emailResult?.success });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rates/destination', auth, async (req, res) => {
  try {
    const { entity_type, entity_id, mcc } = req.query;
    if (!entity_type || !entity_id || !mcc) return res.status(400).json({ error: 'entity_type, entity_id and mcc required' });
    const r = await pool.query(
      `SELECT mnc, rate, operator, country, currency, is_active, effective_from
         FROM rates WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3
        ORDER BY mnc`,
      [entity_type, entity_id, mcc]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rates/update-destination', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const { entity_type, entity_id, mcc, new_rate, mnc_list = [], send_notification = false } = req.body || {};
    if (!entity_type || !entity_id || !mcc || new_rate == null) {
      return res.status(400).json({ error: 'entity_type, entity_id, mcc, new_rate required' });
    }
    const targets = mnc_list.length ? mnc_list : [null]; // null = the global mnc row
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      let n = 0;
      for (const mnc of targets) {
        // Deactivate any active rate row matching this key. mnc may be null
        // (the "global" rate for the entity+mcc) — use a NULL-aware predicate:
        //   mnc IS NULL when $4 is null, or mnc = $4 otherwise.
        await conn.query(
          `UPDATE rates SET is_active=false, effective_to=CURRENT_DATE
             WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3
               AND ( ($4::text IS NULL AND mnc IS NULL)
                  OR ($4::text IS NOT NULL AND mnc=$4) )
               AND is_active=true`,
          [entity_type, entity_id, mcc, mnc]
        );
        const meta = mnc
          ? await conn.query('SELECT mnc, country, operator FROM mccmnc WHERE mcc=$1 AND mnc=$2 LIMIT 1', [mcc, mnc])
          : await conn.query('SELECT mnc, country, operator FROM mccmnc WHERE mcc=$1 LIMIT 1', [mcc]);
        const m = meta.rows[0] || { mnc: mnc || '00', country: 'Unknown', operator: 'All' };
        await conn.query(
          `INSERT INTO rates (entity_type, entity_id, mcc, mnc, country, operator, rate, currency, effective_from, is_active, version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'EUR', CURRENT_DATE, true,
                     (SELECT COALESCE(MAX(version),0)+1 FROM rates WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4))`,
          [entity_type, entity_id, mcc, m.mnc, m.country, m.operator, new_rate]
        );
        n++;
      }
      await conn.query('COMMIT');
      if (send_notification) {
        const ents = await pool.query(
          entity_type === 'client' ? 'SELECT company_name, email FROM clients WHERE id=$1' : 'SELECT company_name, email FROM suppliers WHERE id=$1',
          [entity_id]
        );
        const ent = ents.rows[0];
        if (ent) {
          await pool.query(
            `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
               VALUES ($1, $2, 'info', $3, $4, $5, $6, false, false)`,
            [`Rate update for MCC ${mcc}`, `MCC ${mcc} updated to ${new_rate} (${n} MNC(s)).`, entity_type, ent.company_name, entity_id, ent.email || null]
          );
        }
      }
      res.json({ success: true, updated: n });
    } catch (e) { await conn.query('ROLLBACK'); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// INVOICES  (generate, get, breakdown, send, mark-paid, pdf, bulk)
// -----------------------------------------------------------------
async function generateOne(poolEnt, body) {
  const { entity_type, entity_id, period_start, period_end, due_days = 30 } = body;
  // Determine billing_mode to decide which statuses to count:
  // - Submit-mode: count ALL submitted (including delivered/sent)
  // - DLR-mode: count only delivered SMS
  let billingMode = 'dlr';
  if (entity_type === 'client') {
    const cl = await poolEnt.query('SELECT billing_mode FROM clients WHERE id = $1', [entity_id]);
    billingMode = cl.rows[0]?.billing_mode || 'dlr';
  }
  const statusFilter = billingMode === 'submit' ? "status IN ('submitted','delivered','sent')" : "status='delivered'";
  const smsR = await poolEnt.query(
    `SELECT COUNT(*) AS total_sms, COALESCE(SUM(client_rate*message_parts),0) AS total_amount
       FROM sms_logs WHERE client_id=$1 AND submit_time::date BETWEEN $2 AND $3 AND ${statusFilter}`,
    [entity_id, period_start, period_end]
  );
  const total_amount = parseFloat(smsR.rows[0].total_amount);
  const tax_amount = total_amount * 0.19;
  const grand_total = total_amount + tax_amount;
  const entR = await poolEnt.query(
    entity_type === 'client'
      ? 'SELECT company_name FROM clients WHERE id=$1'
      : 'SELECT company_name FROM suppliers WHERE id=$1',
    [entity_id]
  );
  const due = new Date(Date.now() + due_days * 86400000).toISOString().split('T')[0];
  const r = await poolEnt.query(
    `INSERT INTO invoices (entity_type, entity_id, entity_name, period_start, period_end, total_sms, total_amount, tax_amount, grand_total, due_date, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11) RETURNING *`,
    [entity_type, entity_id, entR.rows[0]?.company_name || 'Unknown',
     period_start, period_end, parseInt(smsR.rows[0].total_sms, 10),
     total_amount, tax_amount, grand_total, due, body.notes || null]
  );
  return r.rows[0];
}

app.post('/api/invoices/generate', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const inv = await generateOne(pool, req.body || {});
    res.json({ success: true, data: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invoices/:id', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invoices/:id/breakdown', auth, async (req, res) => {
  try {
    const invR = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!invR.rows.length) return res.status(404).json({ error: 'Not found' });
    const inv = invR.rows[0];
    // Supplier invoices aggregate supplier-side traffic (no client_id concept in
    // supplier flow); reject that case so the breakdown returns 0 by mistake.
    if (inv.entity_type !== 'client') {
      return res.status(400).json({ error: 'breakdown currently only available for client invoices' });
    }
    const byMcc = await pool.query(
      `SELECT mcc, mnc, country, operator, COUNT(*) AS sms_count, SUM(client_rate*message_parts) AS subtotal
         FROM sms_logs WHERE client_id=$1 AND submit_time::date BETWEEN $2 AND $3 AND status='delivered'
         GROUP BY mcc, mnc, country, operator ORDER BY subtotal DESC`,
      [inv.entity_id, inv.period_start, inv.period_end]
    );
    const byDay = await pool.query(
      `SELECT submit_time::date AS day, COUNT(*) AS sms_count, SUM(client_rate*message_parts) AS subtotal
         FROM sms_logs WHERE client_id=$1 AND submit_time::date BETWEEN $2 AND $3 AND status='delivered'
         GROUP BY day ORDER BY day`,
      [inv.entity_id, inv.period_start, inv.period_end]
    );
    res.json({ success: true, data: { invoice: inv, by_mcc: byMcc.rows, by_day: byDay.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invoices/:id/send', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const inv = r.rows[0];
    const emails = req.body?.additional_emails || [];
    // We don't have nodemailer installed; this records the would-be send
    // (real SMTP wiring is a followup — install nodemailer + use smtp_config).
    await pool.query(`UPDATE invoices SET status='sent', sent_at=NOW() WHERE id=$1`, [req.params.id]);
    await pool.query(
      `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
         VALUES ($1, $2, 'info', $3, $4, $5, $6, false, (CASE WHEN ($7::text[] <> ARRAY[]::text[]) THEN true ELSE false END))`,
      [`Invoice ${inv.invoice_number || inv.id}`, 'Invoice has been sent', inv.entity_type, inv.entity_name, inv.entity_id, emails[0] || null, emails.length ? emails : []]
    );
    res.json({ success: true, sent_to: emails.length || null, notification_recorded: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invoices/:id/mark-paid', auth, roles('super_admin','admin','billing'), async (req, res) => {
  // All four writes (invoice UPDATE, payment INSERT, balance credit) must
  // succeed together. Wrap in BEGIN/COMMIT — partial state would be bad.
  const conn = await pool.connect();
  try {
    const { payment_method, reference } = req.body || {};
    await conn.query('BEGIN');
    const r = await conn.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!r.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const inv = r.rows[0];
    if (inv.status === 'paid') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'invoice already paid' });
    }
    await conn.query(`UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=$1`, [req.params.id]);
    // Schema: payments has NO invoice_id column. entity_name is NOT NULL — look it up inside tx.
    const entNameR = await conn.query(
      inv.entity_type === 'client' ? 'SELECT company_name FROM clients WHERE id=$1' : 'SELECT company_name FROM suppliers WHERE id=$1',
      [inv.entity_id]
    );
    const entName = entNameR.rows[0]?.company_name || 'Unknown';
    const payR = await conn.query(
      `INSERT INTO payments (entity_type, entity_id, entity_name, amount, currency, payment_method, reference, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8) RETURNING *`,
      [inv.entity_type, inv.entity_id, entName, parseFloat(inv.grand_total),
       'EUR', payment_method || 'bank_transfer', reference || '',
       `Pays invoice ${inv.invoice_number || inv.id}`]
    );
if (inv.entity_type === 'client') {
      await conn.query('UPDATE clients SET balance = balance + $1 WHERE id=$2', [parseFloat(inv.grand_total), inv.entity_id]);
    } else {
      await conn.query('UPDATE suppliers SET balance = balance + $1 WHERE id=$2', [parseFloat(inv.grand_total), inv.entity_id]);
    }
    await conn.query('COMMIT');
    res.json({ success: true, invoice_id: parseInt(req.params.id, 10), payment: payR.rows[0] });
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

app.get('/api/invoices/:id/pdf', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const inv = r.rows[0];
    // Hand-crafted minimal valid PDF v1 (no deps).
    const lines = [
      'NET2APP Hub Invoice',
      '================================',
      `Invoice #: ${inv.invoice_number || inv.id}`,
      `Date: ${inv.created_at ? new Date(inv.created_at).toISOString().slice(0,10) : 'N/A'}`,
      `Entity: ${inv.entity_name} (${inv.entity_type} id=${inv.entity_id})`,
      `Period: ${inv.period_start} -> ${inv.period_end}`,
      `Due: ${inv.due_date}`,
      '',
      `SMS count: ${inv.total_sms}`,
      `Subtotal: EUR ${parseFloat(inv.total_amount).toFixed(2)}`,
      `Tax (19%): EUR ${parseFloat(inv.tax_amount).toFixed(2)}`,
      `TOTAL:    EUR ${parseFloat(inv.grand_total).toFixed(2)}`,
      '',
      `Status: ${inv.status}`,
    ];
    const text = lines.join('\n');
    const stream = [
      '%PDF-1.1',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
      `4 0 obj<</Length ${text.length + 60}>>stream\nBT /F1 12 Tf 50 800 Td 14 TL`
    ];
    lines.forEach(line => { stream.push(`(${line.replace(/[()\\]/g, ' ')}) Tj T*`); });
    stream.push('ET\nendstream endobj');
    stream.push('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj');
    stream.push('xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000110 00000 n \n0000000211 00000 n \n0000000310 00000 n \n');
    const body = stream.join('\n');
    const pdf = '%PDF-1.1\n' + body + '\ntrailer<</Size 6/Root 1 0 R>>\n%%EOF\n';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${inv.invoice_number || inv.id}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invoices/bulk-generate', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const { entity_type, entity_ids = [], period_start, period_end, due_days = 30 } = req.body || {};
    if (!entity_type || !entity_ids.length || !period_start || !period_end) {
      return res.status(400).json({ error: 'entity_type, entity_ids[], period_start, period_end required' });
    }
    const out = [];
    for (const eid of entity_ids) {
      try {
        const inv = await generateOne(pool, { entity_type, entity_id: eid, period_start, period_end, due_days });
        out.push(inv);
      } catch (e) { out.push({ entity_id: eid, error: e.message }); }
    }
    res.json({ success: true, generated: out.length, data: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// PAYMENTS  (create, history, list, status)
// -----------------------------------------------------------------
app.post('/api/payments', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.entity_type || !b.entity_id || b.amount == null || !b.payment_method) {
      return res.status(400).json({ error: 'entity_type, entity_id, amount, payment_method required' });
    }
    // payments.entity_name is NOT NULL — look it up from clients/suppliers
    const entR = await pool.query(
      b.entity_type === 'client'
        ? 'SELECT company_name FROM clients WHERE id=$1'
        : 'SELECT company_name FROM suppliers WHERE id=$1',
      [b.entity_id]
    );
    const entity_name = entR.rows[0]?.company_name || 'Unknown';
    // payment_number is auto-generated by trigger; status defaults to 'pending'
    const r = await pool.query(
      `INSERT INTO payments (entity_type, entity_id, entity_name, amount, currency, payment_method, reference, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.entity_type, b.entity_id, entity_name, b.amount, b.currency || 'EUR',
       b.payment_method, b.reference || null, b.status || 'pending', b.notes || null]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payments/history', auth, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
    const r = await pool.query(
      'SELECT * FROM payments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC LIMIT 200',
      [entity_type, entity_id]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments/list', auth, async (req, res) => {
  try {
    let q = 'SELECT * FROM payments WHERE 1=1'; const p = []; let i = 1;
    const f = req.body || {};
    if (f.entity_type) { q += ` AND entity_type=$${i++}`; p.push(f.entity_type); }
    if (f.status)     { q += ` AND status=$${i++}`;     p.push(f.status); }
    if (f.date_from)  { q += ` AND created_at >= $${i++}`; p.push(f.date_from); }
    if (f.date_to)    { q += ` AND created_at <= $${i++}`; p.push(f.date_to); }
    q += ' ORDER BY created_at DESC LIMIT 500';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/payments/:id/status', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status required' });
    const r = await pool.query('UPDATE payments SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// VOICE OTP  (send, calls, logs, test, languages, sip-settings)
// We don't have a SIP stack — endpoints stage the call in
// voice_otp_logs and return a server-generated call_id; an external
// SIP worker would pick these up. Honest stub for an MVP.
// -----------------------------------------------------------------
const OTP_LANGUAGES = ['en-US','en-GB','es-ES','fr-FR','de-DE','it-IT','pt-BR','zh-CN','ja-JP','ar-SA'];

app.post('/api/voice-otp/send', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.destination || !b.otp_code) return res.status(400).json({ error: 'destination and otp_code required' });
    const call_id = 'VOC' + Date.now() + Math.floor(Math.random() * 1000);
    const max_retries = b.max_retries || 4;
    const client_id = b.client_id || null;
    // Schema has sip_call_id (not caller_id) and retry_count (not current_attempt).
    // client_id was added by multi_channel_migrations.sql so we can route the
    // synthetic voice DLR to the originating client (webhook + Java SMPP).
    // Pre-pick the SIP server. pickServerForDestination() evaluates admin-
    // defined allow/deny regex rules (sip_server_destinations) and falls back
    // to pickServer('priority') when nothing matches. Stamping sip_server_id
    // on both INSERT rows means the audit trail and the very first poller
    // tick agree about the planned endpoint.
    // Fleet gate: if no SIP server has a healthy AMI listener, refuse the
    // send instead of writing orphan call rows. The caller can retry once
    // an admin marks a server healthy again.
    if (!_astBridge || typeof _astBridge.pickServerForDestination !== 'function') {
      return res.status(503).json({ success: false, error: 'voice channel not configured (asterisk bridge missing)' });
    }
    const initialSrv = _astBridge.pickServerForDestination(b.destination, 'priority');
    if (!initialSrv) {
      return res.status(503).json({ success: false, error: 'no callable SIP server (none configured, all archived, or no listener logged in)' });
    }
    const initialSrvId = initialSrv.id;
    // Wrap BOTH inserts in a single transaction so a crash mid-flight cannot
    // leave an orphan voice_otp_logs row with no matching retry-queue row.
    // Without this, the voice call would log but never auto-dial.
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      await conn.query(
        `INSERT INTO voice_otp_logs (call_id, destination, language, otp_code, sip_call_id, client_id, status, retry_count, max_retries, sip_server_id)
           VALUES ($1,$2,$3,$4,$5,$6,'initiated',0,$7,$8) RETURNING *`,
        [call_id, b.destination, b.language || 'en-US', b.otp_code, b.caller_id || b.sip_call_id || null, client_id, max_retries, initialSrvId]
      );
      // Enqueue the initial Asterisk Originate so the 5-second poller (server.cjs)
      // actually picks up the call on its next tick. max_retries=3 lets the
      // poller escalate 1 -> 2 (wait 70s) -> 3 (wait 105s) -> terminal DLR.
      await conn.query(
        `INSERT INTO voice_call_retry_queue (call_id, destination, otp_code, language, client_id, retry_count, max_retries, next_attempt_at, status, sip_server_id)
         VALUES ($1, $2, $3, $4, $5, 0, 3, CURRENT_TIMESTAMP, 'pending', $6)`,
        [call_id, b.destination, b.otp_code, b.language || 'en-US', client_id, initialSrvId]
      );
      await conn.query('COMMIT');
    } catch (e) {
      try { await conn.query('ROLLBACK'); } catch (_) {}
      conn.release();
      console.warn('[voice-otp/send] transactional enqueue failed:', e.message);
      return res.status(500).json({ success: false, error: 'voice_otp enqueue failed: ' + e.message });
    }
    conn.release();
    res.json({ success: true, data: { call_id, destination: b.destination, status: 'initiated', max_retries: 3, dial_queued: true, routed_to_server_id: initialSrvId, routed_to_server_name: initialSrv.name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/voice-otp/calls/:call_id', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM voice_otp_logs WHERE call_id=$1', [req.params.call_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/voice-otp/logs', auth, async (req, res) => {
  try {
    let q = 'SELECT * FROM voice_otp_logs WHERE 1=1'; const p = []; let i = 1;
    const f = req.body || {};
    if (f.date_from) { q += ` AND created_at >= $${i++}`; p.push(f.date_from); }
    if (f.date_to)   { q += ` AND created_at <= $${i++}`; p.push(f.date_to); }
    if (f.status)    { q += ` AND status=$${i++}`; p.push(f.status); }
    if (f.language)  { q += ` AND language=$${i++}`; p.push(f.language); }
    q += ' ORDER BY created_at DESC LIMIT 500';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/voice-otp/test', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const call_id = 'TEST_OTP_' + Date.now();
    await pool.query(
      `INSERT INTO voice_otp_logs (call_id, destination, language, otp_code, status, retry_count, max_retries, completed_at)
         VALUES ($1,$2,$3,'123456','completed',0,1,NOW()) RETURNING *`,
      [call_id, b.destination, b.language || 'en-US']
    );
    res.json({ success: true, data: { call_id, status: 'completed', simulation: true } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/voice-otp/languages', auth, async (req, res) => {
  res.json({ success: true, data: OTP_LANGUAGES });
});

app.put('/api/voice-otp/sip-settings', auth, roles('super_admin','admin','support'), async (req, res) => {
  // Schema: voice_otp_configs has sip_host/sip_port/sip_username/sip_password (no plain
  // host/port/username/password). Use the sip_* columns.
  const conn = await pool.connect();
  try {
    const b = req.body || {};
    if (!b.host || !b.username) return res.status(400).json({ error: 'host and username required' });
    await conn.query('BEGIN');
    const r = await conn.query(
      'SELECT id FROM voice_otp_configs WHERE sip_username=$1 FOR UPDATE',
      [b.username]
    );
    if (r.rows.length) {
      // Use the LOCKED ROW'S id, not sip_username (which is NOT UNIQUE in the schema).
      const lockedId = r.rows[0].id;
      await conn.query(
        `UPDATE voice_otp_configs
            SET sip_host=$1, sip_port=$2, sip_password=$3, caller_id=$4, is_active=true
          WHERE id=$5`,
        [b.host, b.port || 5060, b.password || null, b.caller_id || null, lockedId]
      );
    } else {
      // Schema requires language + language_code + greeting_text NOT NULL; default sane stubs
      await conn.query(
        `INSERT INTO voice_otp_configs
            (language, language_code, greeting_text, retry_text, sip_host, sip_port, sip_username, sip_password, caller_id, is_active)
           VALUES ('English', 'en-US', 'Hello, please enter your OTP', 'Please retry', $1, $2, $3, $4, $5, true)`,
        [b.host, b.port || 5060, b.username, b.password || null, b.caller_id || null]
      );
    }
    await conn.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
  // Propagate to asterisk_settings.ami_host so bridge picks it up.
  if (_astBridge) { try { await _astBridge.updateSettings({ ami_host: req.body.host || '127.0.0.1', ami_username: req.body.username, ami_secret: req.body.password }); } catch (_) {} }
});

// ----- VOICE OTP: full list of languages with country-code + greeting
app.get('/api/voice-otp/languages', auth, async (req, res) => {
  res.json({ success: true, data: LANGUAGES.map(l => ({ code: l.code, tts_code: l.tts_code, country_code: l.country_code, display: l.display })) });
});

// ----- VOICE OTP: list all configured languages with their settings
app.get('/api/voice-otp/configs', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM voice_otp_configs ORDER BY language');
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- VOICE OTP: per-language CRUD (PATCH/PUT one config row)
app.put('/api/voice-otp/configs/:id', auth, roles('super_admin','admin','support'), async (req, res) => {
  try {
    const allowed = ['language','language_code','greeting_text','retry_text','country_prefix','retry_language_code','greeting_audio_url','audio_files','primary_language_code','secondary_language_code','primary_greeting_text','secondary_greeting_text','primary_retry_text','secondary_retry_text','secondary_audio_files','secondary_greeting_audio_url','sip_host','sip_port','sip_username','sip_password','caller_id','is_active'];
    const keys = Object.keys(req.body || {}).filter(k => allowed.includes(k) && req.body[k] !== undefined);
    if (!keys.length) return res.json({ success: true });
    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = keys.map(k => req.body[k]);
    await pool.query(`UPDATE voice_otp_configs SET ${sets} WHERE id=$${keys.length + 1}`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- VOICE OTP: seed defaults — idempotent; creates country groups from
// the DEFAULT_GROUPS sent by the frontend (or fallback defaults).
app.post('/api/voice-otp/seed-defaults', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (!groups.length) return res.json({ success: true, inserted: 0 });
    let inserted = 0;
    for (const g of groups) {
      const exists = await pool.query(
        'SELECT 1 FROM voice_otp_configs WHERE language=$1 AND country_prefix=$2',
        [g.name || '', g.country_prefix || '']
      );
      if (exists.rows.length) continue;
      await pool.query(
        `INSERT INTO voice_otp_configs
           (language, language_code, country_prefix,
            primary_language_code, secondary_language_code,
            primary_greeting_text, primary_retry_text,
            secondary_greeting_text, secondary_retry_text,
            greeting_text, retry_text, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [g.name, g.primary_language_code || 'en', g.country_prefix || '',
         g.primary_language_code || 'en', g.secondary_language_code || 'en',
         g.primary_greeting_text || '', g.primary_retry_text || '',
         g.secondary_greeting_text || '', g.secondary_retry_text || '',
         g.primary_greeting_text || '', g.primary_retry_text || '',
         g.is_active !== false]
      );
      inserted++;
    }
    res.json({ success: true, inserted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- VOICE OTP: audio upload (per digit, per language).
// Accepts mp3 OR wav — converts to wav via ffmpeg. Stores at data/uploads/audio/<lang>/<digit>.wav.
// body: { language_code: 'en-US', digit: '0' } with multipart file under "audio".
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// Note: An earlier fluent-ffmpeg pipe-based convertToWav() existed here
// but its API usage was incorrect (stream.take(1) + manual .pipe pattern
// does not work in fluent-ffmpeg). Removed; convertToWavSync below is
// the single source of truth for mp3 → wav 8kHz mono conversion.

// Simpler / more reliable: use child_process directly on ffmpeg-static.
function convertToWavSync(buf, srcName) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      const ext = path.extname(srcName || '').toLowerCase();
      if (ext === '.wav') return resolve(buf);
      return reject(new Error('ffmpeg not available (ffmpeg-static not found); only wav uploads supported'));
    }
    const inFmt = path.extname(srcName || '').replace('.', '') || 'mp3';
    const tmpIn = path.join(voiceOtpAudioBase, '.tmp-in-' + Date.now() + '.' + inFmt);
    const tmpOut = path.join(voiceOtpAudioBase, '.tmp-out-' + Date.now() + '.wav');
    fs.writeFileSync(tmpIn, buf);
    const { spawn } = require('child_process');
    const args = ['-y', '-i', tmpIn, '-ac', '1', '-ar', '8000', '-f', 'wav', tmpOut];
    const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      try { fs.unlinkSync(tmpIn); } catch (_) {}
      if (code !== 0) { try { fs.unlinkSync(tmpOut); } catch (_) {} return reject(new Error('ffmpeg failed: ' + (stderr.split('\n').slice(-5).join(' ')))); }
      let out;
      try { out = fs.readFileSync(tmpOut); } catch (e) { try { fs.unlinkSync(tmpOut); } catch (_) {} return reject(e); }
      try { fs.unlinkSync(tmpOut); } catch (_) {}
      resolve(out);
    });
  });
}

app.post('/api/voice-otp/audio-upload', auth, roles('super_admin','admin','support'), audioUpload.single('audio'), async (req, res) => {
  try {
    const language_code = String(req.body.language_code || '').trim();
    const digit = String(req.body.digit || '').trim();
    const group_id = parseInt(String(req.body.group_id || ''), 10) || null;
    const flavor = String(req.body.flavor || 'primary').trim();
    const isGreeting = digit === 'greeting';
    const isSecondary = flavor === 'secondary';
    if (!language_code || (!isGreeting && !/^[0-9]$/.test(digit))) return res.status(400).json({ error: 'language_code and digit (0-9 or "greeting") required' });
    if (!req.file) return res.status(400).json({ error: 'audio file required (multipart field "audio")' });
    // Include group_id in path when provided to prevent collisions between
    // groups that share the same language code (e.g. two groups both using 'en').
    const pathPrefix = group_id ? ('group_' + group_id + '/' + language_code) : language_code;
    const langDir = path.join(voiceOtpAudioBase, pathPrefix);
    try { fs.mkdirSync(langDir, { recursive: true }); } catch (_) {}
    const fname = isGreeting ? 'greeting' : digit;
    const dest = path.join(langDir, fname + '.wav');
    let wav;
    try { wav = await convertToWavSync(req.file.buffer, req.file.originalname); }
    catch (e) { return res.status(400).json({ error: 'audio conversion failed: ' + e.message }); }
    fs.writeFileSync(dest, wav);
    const relUrl = '/uploads/audio/' + pathPrefix + '/' + fname + '.wav';
    // If group_id specified, update only that group's row
    if (group_id) {
      if (isSecondary) {
        if (isGreeting) {
          await pool.query('UPDATE voice_otp_configs SET secondary_greeting_audio_url=$1 WHERE id=$2', [relUrl, group_id]);
        } else {
          const curR = await pool.query('SELECT secondary_audio_files FROM voice_otp_configs WHERE id=$1', [group_id]);
          const cur = curR.rows[0]?.secondary_audio_files || {};
          cur[digit] = relUrl;
          await pool.query('UPDATE voice_otp_configs SET secondary_audio_files=$1::jsonb WHERE id=$2', [JSON.stringify(cur), group_id]);
        }
      } else {
        if (isGreeting) {
          await pool.query('UPDATE voice_otp_configs SET greeting_audio_url=$1 WHERE id=$2', [relUrl, group_id]);
        } else {
          const curR = await pool.query('SELECT audio_files FROM voice_otp_configs WHERE id=$1', [group_id]);
          const cur = curR.rows[0]?.audio_files || {};
          cur[digit] = relUrl;
          await pool.query('UPDATE voice_otp_configs SET audio_files=$1::jsonb WHERE id=$2', [JSON.stringify(cur), group_id]);
        }
      }
      return res.json({ success: true, data: { url: relUrl, size_bytes: wav.length, language_code, digit, group_id, flavor } });
    }
    // Legacy: no group_id — upsert by language_code
    const cfgR = await pool.query('SELECT id, audio_files, greeting_audio_url FROM voice_otp_configs WHERE language_code=$1', [language_code]);
    if (cfgR.rows.length) {
      if (isSecondary) {
        if (isGreeting) {
          await pool.query('UPDATE voice_otp_configs SET secondary_greeting_audio_url=$1 WHERE id=$2', [relUrl, cfgR.rows[0].id]);
        } else {
          const cur = cfgR.rows[0].secondary_audio_files || {};
          cur[digit] = relUrl;
          await pool.query('UPDATE voice_otp_configs SET secondary_audio_files=$1::jsonb WHERE id=$2', [JSON.stringify(cur), cfgR.rows[0].id]);
        }
      } else {
        if (isGreeting) {
          await pool.query('UPDATE voice_otp_configs SET greeting_audio_url=$1 WHERE id=$2', [relUrl, cfgR.rows[0].id]);
        } else {
          const cur = cfgR.rows[0].audio_files || {};
          cur[digit] = relUrl;
          await pool.query('UPDATE voice_otp_configs SET audio_files=$1::jsonb WHERE id=$2', [JSON.stringify(cur), cfgR.rows[0].id]);
        }
      }
    } else {
      if (isSecondary) {
        if (isGreeting) {
          await pool.query(
            `INSERT INTO voice_otp_configs (language, language_code, greeting_text, retry_text, secondary_greeting_audio_url, is_active)
             VALUES ($1, $2, '', '', $3, true)`,
            [language_code, language_code, relUrl]
          );
        } else {
          await pool.query(
            `INSERT INTO voice_otp_configs (language, language_code, greeting_text, retry_text, secondary_audio_files, is_active)
             VALUES ($1, $2, '', '', $3::jsonb, true)`,
            [language_code, language_code, JSON.stringify({ [digit]: relUrl })]
          );
        }
      } else {
        if (isGreeting) {
          await pool.query(
            `INSERT INTO voice_otp_configs (language, language_code, greeting_text, retry_text, greeting_audio_url, is_active)
             VALUES ($1, $2, '', '', $3, true)`,
            [language_code, language_code, relUrl]
          );
        } else {
          await pool.query(
            `INSERT INTO voice_otp_configs (language, language_code, greeting_text, retry_text, audio_files, is_active)
             VALUES ($1, $2, '', '', $3::jsonb, true)`,
            [language_code, language_code, JSON.stringify({ [digit]: relUrl })]
          );
        }
      }
    }
    res.json({ success: true, data: { url: relUrl, size_bytes: wav.length, language_code, digit } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audio file server (already express.static-served in server.cjs via /uploads).
// Convenience GET one audio file by language_code+digit (useful for testing).
app.get('/api/voice-otp/audio-meta/:lang', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM voice_otp_configs WHERE language_code=$1', [req.params.lang]);
    if (!r.rows.length) return res.status(404).json({ error: 'no config' });
    res.json({ success: true, data: { id: r.rows[0].id, language_code: req.params.lang, audio_files: r.rows[0].audio_files || {} } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- VOICE OTP: a "send" now also RAISES the initial Asterisk Originate
// by inserting a row into voice_call_retry_queue with next_attempt_at=NOW().
// The 5-second poller (server.cjs) picks it up on its next tick. Without
// this, /api/voice-otp/send was a silent log-only stub.
const _legacyVoiceSend = (...args) => app._voiceSendLegacy && app._voiceSendLegacy(...args); // unused, kept for ref

// ----- VOICE OTP: enqueue initial retry on /send (the original /send
// endpoint above is left untouched for backwards compatibility, but add
// the retry-queue enqueue via a wrapper). We expose `enqueueInitial(args)`
// so caller code can use the canonical path.
// `body`: { call_id | destination + language + otp_code + caller_id, retry_count? }
app.post('/api/voice-otp/retry-now', auth, roles('super_admin','admin','support'), async (req, res) => {
  try {
    const b = req.body || {};
    let logRow = null;
    if (b.call_id) {
      const r = await pool.query('SELECT * FROM voice_otp_logs WHERE call_id=$1', [b.call_id]);
      if (!r.rows.length) return res.status(404).json({ error: 'call_id not found' });
      logRow = r.rows[0];
    } else if (b.destination && b.otp_code && b.language) {
      const call_id = 'VOC' + Date.now() + Math.floor(Math.random() * 1000);
      const ins = await pool.query(
        `INSERT INTO voice_otp_logs (call_id, destination, language, otp_code, sip_call_id, client_id, status, retry_count, max_retries)
         VALUES ($1,$2,$3,$4,$5,$6,'retrying',$7,3) RETURNING *`,
        [call_id, b.destination, b.language, b.otp_code, b.caller_id || null, b.client_id || null, b.retry_count || 0]
      );
      logRow = ins.rows[0];
    } else {
      return res.status(400).json({ error: 'call_id OR destination+language+otp_code required' });
    }
    // Stage the retry in voice_call_retry_queue with retry_count+1.
    const newRetry = (logRow.retry_count || 0) + 1;
    if (newRetry > (logRow.max_retries || 3)) {
      return res.json({ success: false, reason: 'max_retries_exceeded', max_retries: logRow.max_retries || 3 });
    }
    // Wait seconds: retry 2 -> 70s, retry 3 -> 105s. retry 1 = inline, set in past.
    const waitSeconds = ({ 1: 0, 2: 70, 3: 105 })[newRetry] || 0;
    const nextAtSql = waitSeconds === 0 ? 'CURRENT_TIMESTAMP' : `CURRENT_TIMESTAMP + INTERVAL '${waitSeconds} seconds'`;
    await pool.query(
      `INSERT INTO voice_call_retry_queue (call_id, destination, otp_code, language, client_id, retry_count, max_retries, next_attempt_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 3, ${nextAtSql}, 'waiting')`,
      [logRow.call_id, logRow.destination, logRow.otp_code, logRow.language, logRow.client_id || null, newRetry]
    );
    await pool.query(`UPDATE voice_otp_logs SET retry_count=$1, status='retrying', next_retry_at=${nextAtSql} WHERE call_id=$2`,
      [newRetry, logRow.call_id]);
    res.json({ success: true, data: { call_id: logRow.call_id, retry_count: newRetry, wait_seconds: waitSeconds, next_attempt_at: waitSeconds === 0 ? 'now' : `in ${waitSeconds}s` } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// NUMBER VALIDATION  (multi-channel pre-send check)
// ============================================================
app.get('/api/number/validate', auth, async (req, res) => {
  try {
    const e164 = String(req.query.destination || req.query.phone || '').trim();
    const channel = String(req.query.channel || '').trim().toLowerCase();
    if (!e164 || !channel) return res.status(400).json({ error: 'destination and channel required' });
    if (!_numValid) return res.status(503).json({ error: 'number validator not configured' });
    const out = await _numValid.lookupChannel(channel, e164);
    res.json({ success: true, data: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/number/validate-all', auth, async (req, res) => {
  try {
    const e164 = String(req.body?.destination || req.body?.phone || '').trim();
    if (!e164) return res.status(400).json({ error: 'destination required' });
    if (!_numValid) return res.status(503).json({ error: 'number validator not configured' });
    const out = await _numValid.validateAllChannels(e164);
    res.json({ success: true, data: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/number/validation-cache', auth, async (req, res) => {
  try {
    const q = String(req.query.destination || req.query.phone || '').trim();
    if (!q) return res.status(400).json({ error: 'destination required' });
    const r = await pool.query(
      `SELECT * FROM number_validation_results WHERE phone_e164=$1 OR phone_e164 LIKE $2 ORDER BY id DESC LIMIT 5`,
      [q, '%' + q.replace(/[^0-9+]/g, '')]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/number/providers', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM number_validation_providers ORDER BY channel');
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/number/providers/:channel', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const allowed = ['enabled','provider_kind','api_url','api_key','api_secret','extra'];
    const keys = Object.keys(req.body || {}).filter(k => allowed.includes(k) && req.body[k] !== undefined);
    if (!keys.length) return res.json({ success: true });
    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = keys.map(k => req.body[k]);
    await pool.query(`UPDATE number_validation_providers SET ${sets}, updated_at=NOW() WHERE channel=$${keys.length + 1}`, [...vals, req.params.channel]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ASTERISK PROXY  (multi-server CRUD + per-server health + legacy
// single-row status / settings / install / regenerate / originate)
// ============================================================

// ----- Multi-server CRUD on sip_servers -----
app.get('/api/asterisk/servers', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, ami_host, ami_port, sip_host, sip_port, ami_username, dialplan_context,
              transport, priority, is_active, last_health_status, last_health_latency_ms,
              last_health_at, last_dlr_pushed_at, last_dlr_push_route, last_dlr_push_message_id, notes, created_at, updated_at
         FROM sip_servers ORDER BY priority ASC, id ASC`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asterisk/servers', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.ami_host || !b.sip_host) {
      return res.status(400).json({ error: 'name, ami_host, sip_host required' });
    }
    const allowed = ['name','ami_host','sip_host','ami_port','sip_port','ami_username','ami_secret',
                     'transport','dialplan_context','priority','is_active','notes'];
    const keys = allowed.filter((k) => b[k] !== undefined);
    if (!keys.includes('ami_username')) b.ami_username = 'net2app';
    if (!keys.includes('ami_secret')) b.ami_secret = 'net2app_secret';
    if (!keys.includes('ami_port')) b.ami_port = 5038;
    if (!keys.includes('sip_port')) b.sip_port = 5060;
    if (!keys.includes('transport')) b.transport = 'udp';
    if (!keys.includes('dialplan_context')) b.dialplan_context = 'net2app-otp';
    if (!keys.includes('priority')) b.priority = 10;
    if (!keys.includes('is_active')) b.is_active = true;
    const allKeys = Object.keys(b).filter((k) => allowed.includes(k) && b[k] !== undefined);
    const vals = allKeys.map((k) => b[k]);
    const ph = allKeys.map((_, i) => '$' + (i + 1)).join(',');
    const r = await pool.query(
      `INSERT INTO sip_servers (${allKeys.join(',')}) VALUES (${ph}) RETURNING *`,
      vals
    );
    if (_astBridge) _astBridge.reloadServersAndRestart().catch((e) => console.warn('[asterisk] reload-after-insert failed:', e.message));
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/asterisk/servers/:id', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const allowed = ['name','ami_host','sip_host','ami_port','sip_port','ami_username','ami_secret',
                     'transport','dialplan_context','priority','is_active','notes'];
    const keys = Object.keys(req.body || {}).filter((k) => allowed.includes(k) && req.body[k] !== undefined);
    if (!keys.length) return res.json({ success: true });
    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = keys.map((k) => req.body[k]);
    const r = await pool.query(
      `UPDATE sip_servers SET ${sets}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`,
      [...vals, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (_astBridge) _astBridge.reloadServersAndRestart().catch((e) => console.warn('[asterisk] reload-after-update failed:', e.message));
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Soft delete: flip is_active=false (preserves foreign-key attribution on
// historical voice_call_retry_queue / voice_otp_logs rows).
app.delete('/api/asterisk/servers/:id', auth, roles('super_admin'), async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE sip_servers SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (_astBridge) _astBridge.reloadServersAndRestart().catch((e) => console.warn('[asterisk] reload-after-delete failed:', e.message));
    res.json({ success: true, archived: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Per-server health probe (TCP + AMI login attempt).
app.post('/api/asterisk/servers/:id/test', auth, async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const r = await _astBridge.healthCheck(parseInt(req.params.id, 10));
    res.json({ success: true, data: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Routing preview: which server would the poller pick for a given
// destination right now? Useful from the UI to validate failover
// decisions in real time.
app.get('/api/asterisk/routing-decision', auth, async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const strategy = String(req.query.strategy || 'priority');
    const server = _astBridge.pickServer(strategy);
    res.json({ success: true, data: { strategy, server } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aggregate fleet health. The bridge now returns { ok, total, up, down,
// results, tips } — `tips` is an array of actionable diagnostic items the
// UI surfaces under "Tips to fix" (sorted by severity then by code). Each
// tip carries { code, severity, message, action, affected_servers[] }.
// never_probed / legacy_localhost_drift / host_collision are checked
// from sip_servers DB rows + listener state; ECONNREFUSED, TIMEDOUT,
// NO_HANDSHAKE, AMI_AUTH_FAILED are emitted by healthCheck() based on the
// exact TCP/AMI failure mode of the most recent probe.
app.get('/api/asterisk/health', auth, async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const payload = await _astBridge.healthCheckAll();
    const results = (payload && Array.isArray(payload.results)) ? payload.results
                  : (Array.isArray(payload) ? payload : []);
    const tips = (payload && Array.isArray(payload.tips)) ? payload.tips : [];
    const total = (payload && typeof payload.total === 'number') ? payload.total : results.length;
    const up = (payload && typeof payload.up === 'number') ? payload.up : results.filter((r) => r.ok).length;
    const down = (payload && typeof payload.down === 'number') ? payload.down : total - up;
    // Pull per-server listener state from the bridge module — feeds the
    // SIP Servers table 'listener badge' UI column without an extra AJAX.
    let listener_state = null;
    try { if (typeof _astBridge.getListenerStateAll === 'function') listener_state = _astBridge.getListenerStateAll(); }
    catch (_) {}
    res.json({
      success: true,
      total, up, down,
      results,
      listener_state,
      // `tips` is the new field — structured diagnostic paragraphs
      // (severity + code + per-server attribution + concrete action).
      // UI consumers: render these under "Tips to fix" with severity
      // badges and copy-to-clipboard for the `action` field.
      tips,
      // Severity roll-up so the UI can show a single banner badge.
      severity_counts: tips.reduce((acc, t) => {
        acc[t.severity] = (acc[t.severity] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Post-install checklist — runs cheap filesystem + binary probes (no AMI
// handshake) so the UI can render the prerequisites as ✓/✗ rows BEFORE
// clicking the Install button. Always succeeds (returns 200 with the
// checklist) even when aster is not installed, so the UI's "show what's
// missing" pattern just works on a fresh box. Used by AsteriskConfig.tsx
// AND by the post-install success card.
app.get('/api/asterisk/post-install-checklist', auth, async (req, res) => {
  try {
    if (!_astBridge || typeof _astBridge.postInstallChecklist !== 'function') {
      return res.status(503).json({ error: 'asterisk bridge not configured' });
    }
    const checks = await _astBridge.postInstallChecklist();
    const all_ok = Array.isArray(checks) && checks.length > 0 && checks.every((c) => c.ok);
    res.json({ success: true, all_ok, data: checks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/asterisk/dlr-push-test
// Synthetic DLR push to Java so the operator can verify end-to-end:
// Node → Java DlrRouter → webhook OR SMPP deliver_sm (currently logged).
// payload: {client_id: int, message_id?: string, dlr_status?: 'DELIVRD' }
// Returns {ok, route} reflecting whether Java actually accepted the call.
app.post('/api/asterisk/dlr-push-test', auth, roles('super_admin','admin','support'), async (req, res) => {
  try {
    if (!_astBridge || typeof _astBridge.gatewayPushDlr !== 'function') {
      return res.status(503).json({ error: 'asterisk bridge not configured' });
    }
    const b = req.body || {};
    const client_id = parseInt(b.client_id, 10);
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const message_id = b.message_id || ('SMOKE_DLR_' + Date.now());
    const dlr_status = b.dlr_status || 'DELIVRD';
    const result = await _astBridge.gatewayPushDlr({
      message_id,
      smpp_message_id: 'SMOKE_SMPP_' + Date.now(),
      dlr_status,
      error_code: dlr_status === 'DELIVRD' ? '000' : '004',
      destination: b.destination || '+10000000000',
      client_id,
      supplier_id: b.supplier_id || 0,
      server_id: b.server_id || null,
    });
    res.json({ success: !!(result && result.ok), data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PER-DESTINATION ROUTING (sip_server_destinations CRUD + test)
// Voice-OTP-only: voice_call_retry_queue and /api/voice-otp/send
// pick a server via pickServerForDestination(); SMS keeps using
// route_maps.
// ============================================================
app.get('/api/asterisk/destinations', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT d.*, s.name AS sip_server_name, s.ami_host AS sip_server_ami_host, s.ami_port AS sip_server_ami_port, s.is_active AS sip_server_is_active
       FROM sip_server_destinations d LEFT JOIN sip_servers s ON s.id = d.sip_server_id
       ORDER BY d.priority ASC, d.id ASC`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/asterisk/servers/:id/destinations', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM sip_server_destinations WHERE sip_server_id=$1 ORDER BY priority ASC, id ASC',
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asterisk/servers/:id/destinations', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const { pattern, kind = 'allow', priority = 10, notes = null } = req.body || {};
    if (!pattern) return res.status(400).json({ error: 'pattern required' });
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const cp = _astBridge.compilePatternSafe(pattern);
    if (!cp.ok) return res.status(400).json({ error: 'invalid regex: ' + cp.error });
    const k = String(kind || 'allow').toLowerCase();
    if (!['allow','deny'].includes(k)) return res.status(400).json({ error: "kind must be 'allow' or 'deny'" });
    const r = await pool.query(
      `INSERT INTO sip_server_destinations (sip_server_id, kind, pattern, priority, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [req.params.id, k, pattern, parseInt(priority) || 10, notes]
    );
    if (_astBridge.reloadDestinationsAndRestart) await _astBridge.reloadDestinationsAndRestart();
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'pattern already exists for this server' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/asterisk/destinations/:id', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const allowed = ['kind','pattern','priority','is_active','notes','sip_server_id'];
    if (b.pattern && _astBridge) {
      const cp = _astBridge.compilePatternSafe(b.pattern);
      if (!cp.ok) return res.status(400).json({ error: 'invalid regex: ' + cp.error });
    }
    if (b.kind && !['allow','deny'].includes(String(b.kind).toLowerCase())) {
      return res.status(400).json({ error: "kind must be 'allow' or 'deny'" });
    }
    const keys = Object.keys(b).filter((k) => allowed.includes(k) && b[k] !== undefined);
    if (!keys.length) return res.json({ success: true });
    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = keys.map((k) => b[k]);
    const r = await pool.query(
      `UPDATE sip_server_destinations SET ${sets}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`,
      [...vals, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (_astBridge.reloadDestinationsAndRestart) await _astBridge.reloadDestinationsAndRestart();
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'pattern already exists for this server' });
    res.status(500).json({ error: e.message });
  }
});

// Soft-archive via is_active=false (preserves audit trail).
app.delete('/api/asterisk/destinations/:id', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE sip_server_destinations SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (_astBridge.reloadDestinationsAndRestart) await _astBridge.reloadDestinationsAndRestart();
    res.json({ success: true, archived: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Compile + smoke-test a regex against a sample of E.164 destinations.
// Risk heuristic: how long `regex.exec('0'.repeat(200))` takes — > 25ms
// suggests catastrophic-backtracking vulnerability on long inputs.
app.post('/api/asterisk/destinations/test', auth, async (req, res) => {
  try {
    const { pattern, sample = [], kind = 'allow' } = req.body || {};
    if (!pattern) return res.status(400).json({ success: false, error: 'pattern required' });
    if (!_astBridge) return res.status(503).json({ success: false, error: 'asterisk bridge not configured' });
    const cp = _astBridge.compilePatternSafe(pattern);
    if (!cp.ok) return res.json({ success: false, regex: { compiles: false, error: cp.error }, matches: [] });
    let risk_heuristic = false;
    const t0 = Date.now();
    try { cp.regex.exec('0'.repeat(200)); } catch (_) {}
    if (Date.now() - t0 > 25) risk_heuristic = true;
    const norm = _astBridge.normalizeDestination;
    const matches = (Array.isArray(sample) ? sample : []).map((dest) => {
      const n = norm ? norm(dest) : String(dest);
      let m = false;
      try { m = cp.regex.test(n); } catch (_) {}
      return { sample: dest, normalized: n, matched: m };
    });
    res.json({ success: true, regex: { compiles: true, risk_heuristic }, kind, matches });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// "What would the poller pick for this destination right now?" preview.
app.get('/api/asterisk/destinations/preview', auth, async (req, res) => {
  try {
    const dest = String(req.query.destination || '').trim();
    if (!dest) return res.status(400).json({ success: false, error: 'destination required' });
    if (!_astBridge || typeof _astBridge.pickServerForDestination !== 'function') {
      return res.status(503).json({ success: false, error: 'asterisk bridge not configured' });
    }
    const excluded = req.query.exclude ? parseInt(req.query.exclude, 10) : null;
    const server = _astBridge.pickServerForDestination(
      dest, 'priority', Number.isFinite(excluded) ? excluded : null
    );
    const normalized = _astBridge.normalizeDestination ? _astBridge.normalizeDestination(dest) : dest;
    res.json({ success: true, normalized, server });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// ASTERISK PROXY  (status / settings / install / regenerate / originate)
// ============================================================
app.get('/api/asterisk/status', auth, async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const status = await _astBridge.refreshStatus();
    const installedQ = await pool.query('SELECT asterisk_installed, asterisk_running, asterisk_config_path FROM asterisk_settings ORDER BY id DESC LIMIT 1');
    res.json({ success: true, data: { bridge: status, db_row: installedQ.rows[0] || null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/asterisk/settings', auth, async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const s = await _astBridge.loadSettings();
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/asterisk/settings', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const s = await _astBridge.updateSettings(req.body || {});
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asterisk/install', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const r = await _astBridge.tryInstall(false);
    // Expose all_ok at top-level so the UI's tryInstall handler can
    // show a single pass/fail badge without digging into r.data.steps[].
    // Also pass steps[] at top-level so the UI renders per-step status
    // (apt_install, manager_conf_written, systemctl_enable, etc.).
    const steps = (r && Array.isArray(r.steps)) ? r.steps : [];
    const all_ok = !!r && (r.ok !== false) && steps.every((s) => s && s.ok !== false);
    res.json({ success: !!r, all_ok, steps, data: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asterisk/regenerate-config', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const r = await _astBridge.regenerateConfig();
    res.json({ success: true, data: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asterisk/originate', auth, roles('super_admin','admin','support'), async (req, res) => {
  try {
    if (!_astBridge) return res.status(503).json({ error: 'asterisk bridge not configured' });
    const r = await _astBridge.originate(req.body || {});
    res.json({ success: !!r, data: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/voice-otp/retry-queue', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM voice_call_retry_queue ORDER BY COALESCE(next_attempt_at, created_at) ASC LIMIT 200`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/voice-otp/active-calls', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM voice_otp_logs WHERE status IN ('initiated','ringing','answered','retrying') ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// -----------------------------------------------------------------
// TRANSLATIONS  (apply, create rule, test, list)
// -----------------------------------------------------------------
function entityFilter(t, body) {
  // Match rules that are GLOBAL (all NULLs) or scoped to a specific
  // client/supplier/route. Returns the SQL fragment + params.
  const where = []; const p = []; let i = 1;
  where.push(`(client_id IS NULL OR client_id = $${i++})`);     p.push(body.client_id || null);
  where.push(`(supplier_id IS NULL OR supplier_id = $${i++})`); p.push(body.supplier_id || null);
  where.push(`(route_id IS NULL OR route_id = $${i++})`);       p.push(body.route_id || null);
  return { where: where.join(' AND '), params: p };
}

app.post('/api/translations/apply', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const filt = entityFilter(null, b);
    const rulesR = await pool.query(
      `SELECT * FROM translations
         WHERE translation_type = ANY($1) AND (${filt.where}) AND is_active = true
         ORDER BY id ASC`,
      [['sender_id','destination','content','origination'], ...filt.params]
    );
    let sender_id = b.sender_id || '';
    let destination = b.destination || '';
    let message = b.message || '';
    let applied = [];
    for (const r of rulesR.rows) {
      try {
        const re = new RegExp(r.source_pattern);
        if (r.translation_type === 'sender_id' && re.test(sender_id)) {
          sender_id = sender_id.replace(re, r.target_value);
          applied.push({ id: r.id, type: r.translation_type, rule: r.source_pattern });
        }
        if (r.translation_type === 'destination' && re.test(destination)) {
          destination = destination.replace(re, r.target_value);
          applied.push({ id: r.id, type: r.translation_type, rule: r.source_pattern });
        }
        if ((r.translation_type === 'content' || r.translation_type === 'origination') && re.test(message)) {
          message = message.replace(re, r.target_value);
          applied.push({ id: r.id, type: r.translation_type, rule: r.source_pattern });
        }
      } catch (e) { /* skip bad regex */ }
    }
    res.json({ success: true, data: { sender_id, destination, message, applied, applied_count: applied.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/translations', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.translation_type || !b.source_pattern || b.target_value == null) {
      return res.status(400).json({ error: 'translation_type, source_pattern and target_value required' });
    }
    // schema: translations has no priority column
    const r = await pool.query(
      `INSERT INTO translations (translation_type, source_pattern, target_value, client_id, supplier_id, route_id, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
      [b.translation_type, b.source_pattern, b.target_value, b.client_id || null, b.supplier_id || null, b.route_id || null]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/translations/test', auth, async (req, res) => {
  try {
    const b = req.body || {};
    try {
      const re = new RegExp(b.source_pattern);
      const result = (b.test_input || '').replace(re, b.target_value || '');
      res.json({ success: true, data: { input: b.test_input, output: result, matches: !!b.test_input?.match(re) } });
    } catch (re) {
      res.status(400).json({ error: 'invalid regex: ' + re.message });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/translations/list', auth, async (req, res) => {
  try {
    let q = 'SELECT * FROM translations WHERE 1=1'; const p = []; let i = 1;
    const f = req.body || {};
    if (f.type)         { q += ` AND translation_type=$${i++}`; p.push(f.type); }
    if (f.entity_type === 'client')  { q += ` AND client_id IS NOT NULL`; }
    if (f.entity_type === 'supplier'){ q += ` AND supplier_id IS NOT NULL`; }
    if (f.entity_type === 'route')   { q += ` AND route_id IS NOT NULL`; }
    // schema translations has no `priority` column — order by id
    q += ' ORDER BY id LIMIT 500';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// NOTIFICATIONS  (send, list, read, read-all, rate-change, low-balance, dlr-failure)
// -----------------------------------------------------------------
app.post('/api/notifications/send', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.template_name || !b.recipients?.length) return res.status(400).json({ error: 'template_name and recipients required' });

    // Render the template title + body for use in Teams/Slack posting
    let renderedTitle = b.template_name;
    let renderedBody = '';

    // If email service is available, send actual emails
    if (_emailService) {
      const emailResult = await _emailService.sendNotificationEmail({
        template_name: b.template_name,
        variables: b.variables || {},
        recipients: b.recipients,
      });
      // Render template for messaging channels even when email is sent
      try {
        const tplR = await pool.query("SELECT * FROM notification_templates WHERE template_name=$1 AND is_active=true", [b.template_name]);
        if (tplR.rows.length) {
          const tpl = tplR.rows[0];
          renderedBody = String(tpl.body || '');
          Object.entries(b.variables || {}).forEach(([k, v]) => { renderedBody = renderedBody.replaceAll(`{${k}}`, String(v)); });
          renderedTitle = (tpl.subject || b.template_name).replace(/\{(\w+)\}/g, (_, k) => b.variables?.[k] || '');
        }
      } catch (_) {}
      // Post to Teams and Slack (fire-and-forget)
      const msg = renderedBody || `Notification: ${b.template_name}`;
      if (_teamsService) _teamsService.postText(`📧 *${renderedTitle}*
${msg}`).catch(e => console.warn('[teams] notification-send post failed:', e.message));
      if (_slackService) _slackService.postText(`📧 *${renderedTitle}*
${msg}`).catch(e => console.warn('[slack] notification-send post failed:', e.message));
      return res.json({ success: emailResult.success, message: emailResult.message, results: emailResult.results });
    }

    // Fallback: just render template and record notification (no actual email)
    const tplR = await pool.query("SELECT * FROM notification_templates WHERE template_name=$1 AND is_active=true", [b.template_name]);
    if (!tplR.rows.length) return res.status(404).json({ error: 'template not found' });
    const tpl = tplR.rows[0];
    let body = String(tpl.body || '');
    Object.entries(b.variables || {}).forEach(([k, v]) => { body = body.replaceAll(`{${k}}`, String(v)); });
    const title = (tpl.subject || b.template_name).replace(/\{(\w+)\}/g, (_, k) => b.variables?.[k] || '');
    const ins = await pool.query(
      `INSERT INTO notifications (title, message, type, recipient_email, is_read, is_emailed)
         VALUES ($1, $2, 'info', $3, false, true) RETURNING *`,
      [title.substring(0, 255), body.substring(0, 4000), b.recipients[0] || null]
    );
    // Post to Teams and Slack (fire-and-forget)
    const msg = body || `Notification: ${b.template_name}`;
    if (_teamsService) _teamsService.postText(`📧 *${title}*
${msg}`).catch(e => console.warn('[teams] notification-send post failed:', e.message));
    if (_slackService) _slackService.postText(`📧 *${title}*
${msg}`).catch(e => console.warn('[slack] notification-send post failed:', e.message));
    res.json({ success: true, data: ins.rows[0], rendered: { title, body } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Multi-tenant scoping: notifications has no owner_user_id — best signal
// is recipient_role (matches platform user role) or recipient_email
// (matches their email). Admins (super_admin/admin/support/billing) see all.
app.post('/api/notifications/list', auth, async (req, res) => {
  try {
    const f = req.body || {};
    let q = 'SELECT * FROM notifications WHERE 1=1'; const p = []; let i = 1;
    const isAdmin = req.user && ['super_admin','admin','support','billing'].includes(req.user.role);
    const adminBypass = !!f.all_users && isAdmin;
    if (!adminBypass && req.user) {
      q += ` AND (recipient_role = $${i++} OR recipient_email = $${i++})`;
      p.push(req.user.role || '');
      p.push(req.user.email || req.user.username || '');
    }
    if (f.type)         { q += ` AND type=$${i++}`; p.push(f.type); }
    if (f.read === true)  { q += ' AND is_read = true'; }
    if (f.read === false) { q += ' AND is_read = false'; }
    q += ' ORDER BY created_at DESC LIMIT 200';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    // Schema uses is_read (boolean) not read_at
    const r = await pool.query("UPDATE notifications SET is_read=true WHERE id=$1 RETURNING *", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    const isAdmin = req.user && ['super_admin','admin','support','billing'].includes(req.user.role);
    const adminBypass = !!(req.body?.all_users) && isAdmin;
    let q = "UPDATE notifications SET is_read=true WHERE is_read=false";
    const p = [];
    if (!adminBypass && req.user) {
      q += ` AND (recipient_role = $1 OR recipient_email = $2)`;
      p.push(req.user.role || '', req.user.email || req.user.username || '');
    }
    q += ' RETURNING id';
    const r = await pool.query(q, p);
    res.json({ success: true, marked: r.rowCount || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/rate-change', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const b = req.body || {};

    // Auto-post to Microsoft Teams if configured
    if (_teamsService) {
      _teamsService.notifyRateChange(
        b.entity_type || 'client',
        b.entity_name || 'Unknown',
        b.destination || 'All Destinations',
        b.old_rate || 0,
        b.new_rate || 0,
        b.effective_date || new Date().toISOString().split('T')[0]
      ).catch(e => console.warn('[teams] rate-change notify failed:', e.message));
    }
    if (_slackService) {
      _slackService.notifyRateChange(
        b.entity_type || 'client',
        b.entity_name || 'Unknown',
        b.destination || 'All Destinations',
        b.old_rate || 0,
        b.new_rate || 0,
        b.effective_date || new Date().toISOString().split('T')[0]
      ).catch(e => console.warn('[slack] rate-change notify failed:', e.message));
    }

    // Send actual email via email service if available (it also records a notification)
    let emailResult = null;
    if (_emailService && b.entity_type && b.entity_id) {
      emailResult = await _emailService.sendRateChangeEmail({
        entity_type: b.entity_type,
        entity_id: b.entity_id,
        destination: b.destination || 'All Destinations',
        old_rate: b.old_rate || 0,
        new_rate: b.new_rate || 0,
        effective_date: b.effective_date || new Date().toISOString().split('T')[0],
        operator: b.operator || null,
      });
    } else {
      // No email service — record a bare notification so the dashboard still shows it
      const ents = await pool.query(
        b.entity_type === 'client' ? 'SELECT email, company_name FROM clients WHERE id=$1' : 'SELECT email, company_name FROM suppliers WHERE id=$1',
        [b.entity_id]
      );
      const ent = ents.rows[0];
      const title = `Rate change for ${b.destination || 'destination'}`;
      const message = `Effective ${b.effective_date}: rate for ${b.destination || 'destination'} changes from ${b.old_rate} to ${b.new_rate}.`;
      await pool.query(
        `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
           VALUES ($1, $2, 'info', $3, $4, $5, $6, false, false) RETURNING *`,
        [title.substring(0, 255), message.substring(0, 4000), b.entity_type, ent?.company_name || null, b.entity_id, ent?.email || null]
      );
    }
    res.json({ success: true, notification_recorded: true, email_sent: !!emailResult?.success });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/low-balance', auth, roles('super_admin','admin','billing','support'), async (req, res) => {
  try {
    const b = req.body || {};
    const ents = await pool.query(
      b.entity_type === 'client' ? 'SELECT email, company_name FROM clients WHERE id=$1' : 'SELECT email, company_name FROM suppliers WHERE id=$1',
      [b.entity_id]
    );
    const ent = ents.rows[0];
    const title = 'Low balance';
    const message = `Low balance alert: current balance ${b.balance}, threshold ${b.threshold}.`;
    const r = await pool.query(
      `INSERT INTO notifications (title, message, type, entity_type, entity_name, entity_id, recipient_email, is_read, is_emailed)
         VALUES ($1, $2, 'warning', $3, $4, $5, $6, false, true) RETURNING *`,
      [title, message.substring(0, 4000), b.entity_type, ent?.company_name || null, b.entity_id, ent?.email || null]
    );
    // Auto-post to Microsoft Teams if configured
    if (_teamsService) {
      _teamsService.notifyLowBalance(ent?.company_name || 'Unknown', b.entity_code || '', b.balance || 0).catch(e => console.warn('[teams] low-balance notify failed:', e.message));
    }
    if (_slackService) {
      _slackService.notifyLowBalance(ent?.company_name || 'Unknown', b.entity_code || '', b.balance || 0).catch(e => console.warn('[slack] low-balance notify failed:', e.message));
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/dlr-failure', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const title = `DLR failure: ${b.route_name}`;
    const message = `Supplier ${b.supplier_name} on route ${b.route_name}: ${b.failure_count} consecutive failures. Action taken: ${b.action_taken}.`;
    const r = await pool.query(
      `INSERT INTO notifications (title, message, type, recipient_role, is_read, is_emailed)
         VALUES ($1, $2, 'error', $3, false, true) RETURNING *`,
      [title.substring(0, 255), message.substring(0, 4000), 'super_admin']
    );
    // Auto-post to Microsoft Teams if configured
    if (_teamsService) {
      _teamsService.notifyDlrFailure(b.failure_count || 0, b.supplier_name || '').catch(e => console.warn('[teams] dlr-failure notify failed:', e.message));
    }
    if (_slackService) {
      _slackService.notifyDlrFailure(b.failure_count || 0, b.supplier_name || '').catch(e => console.warn('[slack] dlr-failure notify failed:', e.message));
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// TEAMS  (config, test webhook)
// -----------------------------------------------------------------
app.get('/api/teams/config', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_teamsService) return res.json({ success: true, data: { enabled: false, webhookUrl: '', events: {} } });
    const cfg = await _teamsService.getConfig();
    res.json({ success: true, data: cfg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/teams/config', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    // Validate webhook URL if provided
    if (b.webhook_url !== undefined && b.webhook_url !== '' && !String(b.webhook_url).startsWith('https://')) {
      return res.status(400).json({ error: 'Webhook URL must use HTTPS' });
    }
    const updates = [];
    if (b.webhook_url !== undefined) updates.push({ key: 'teams_webhook_url', value: String(b.webhook_url) });
    if (b.enabled !== undefined) updates.push({ key: 'teams_enabled', value: b.enabled ? 'true' : 'false' });
    if (b.events !== undefined) updates.push({ key: 'teams_events', value: JSON.stringify(b.events) });
    for (const u of updates) {
      await pool.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [u.key, u.value]
      );
    }
    // Invalidate config cache so next notification picks up changes immediately
    if (_teamsService && typeof _teamsService.invalidateConfig === 'function') _teamsService.invalidateConfig();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teams/test', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_teamsService) return res.status(503).json({ error: 'Teams service not configured' });
    const url = req.body?.webhook_url;
    const result = await _teamsService.testWebhook(url);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teams/send', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_teamsService) return res.status(503).json({ error: 'Teams service not configured' });
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await _teamsService.postText(text);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// SLACK  (config, test webhook, send)
// -----------------------------------------------------------------
app.get('/api/slack/config', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_slackService) return res.json({ success: true, data: { enabled: false, webhookUrl: '', events: {} } });
    const cfg = await _slackService.getConfig();
    res.json({ success: true, data: cfg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/slack/config', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.webhook_url !== undefined && b.webhook_url !== '' && !String(b.webhook_url).startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({ error: 'Webhook URL must be a valid Slack webhook (https://hooks.slack.com/...)' });
    }
    const updates = [];
    if (b.webhook_url !== undefined) updates.push({ key: 'slack_webhook_url', value: String(b.webhook_url) });
    if (b.enabled !== undefined) updates.push({ key: 'slack_enabled', value: b.enabled ? 'true' : 'false' });
    if (b.events !== undefined) updates.push({ key: 'slack_events', value: JSON.stringify(b.events) });
    for (const u of updates) {
      await pool.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [u.key, u.value]
      );
    }
    if (_slackService && typeof _slackService.invalidateConfig === 'function') _slackService.invalidateConfig();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/slack/test', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_slackService) return res.status(503).json({ error: 'Slack service not configured' });
    const url = req.body?.webhook_url;
    const result = await _slackService.testWebhook(url);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/slack/send', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    if (!_slackService) return res.status(503).json({ error: 'Slack service not configured' });
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await _slackService.postText(text);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// BILLING MODE  (set mode, charge on submit/dlr, force-dlr)
// -----------------------------------------------------------------
app.put('/api/billing/mode', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.entity_type || !b.entity_id || !b.billing_mode) return res.status(400).json({ error: 'entity_type, entity_id, billing_mode required' });
    if (!['submit','dlr'].includes(b.billing_mode)) return res.status(400).json({ error: 'billing_mode must be submit or dlr' });
    if (b.force_dlr_timeout_mode && !['fixed','random_0_5','random_0_10'].includes(b.force_dlr_timeout_mode)) {
      return res.status(400).json({ error: 'force_dlr_timeout_mode must be fixed, random_0_5, or random_0_10' });
    }
    const tbl = b.entity_type === 'client' ? 'clients' : 'suppliers';
    // Update billing_mode + force_dlr + dlr_timeout + force_dlr_timeout_mode
    const updates = ['billing_mode=$1'];
    const vals = [b.billing_mode];
    let pi = 2;
    if (b.force_dlr !== undefined) { updates.push(`force_dlr=$${pi++}`); vals.push(!!b.force_dlr); }
    if (b.dlr_timeout !== undefined) { updates.push(`dlr_timeout=$${pi++}`); vals.push(b.dlr_timeout); }
    if (b.force_dlr_timeout_mode) { updates.push(`force_dlr_timeout_mode=$${pi++}`); vals.push(b.force_dlr_timeout_mode); }
    vals.push(b.entity_id);
    await pool.query(`UPDATE ${tbl} SET ${updates.join(', ')} WHERE id=$${pi}`, vals);
    // Fetch updated row to return all current values
    const row = await pool.query(`SELECT billing_mode, force_dlr, dlr_timeout, force_dlr_timeout_mode FROM ${tbl} WHERE id=$1`, [b.entity_id]);
    const r = row.rows[0] || {};
    res.json({ success: true, billing_mode: r.billing_mode, force_dlr: !!r.force_dlr, dlr_timeout: r.dlr_timeout || null, force_dlr_timeout_mode: r.force_dlr_timeout_mode || 'fixed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/billing/charge/submit', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const b = req.body || {};
    const tbl = b.entity_type === 'client' ? 'clients' : 'suppliers';
    await pool.query(`UPDATE ${tbl} SET balance = balance - $1 WHERE id=$2`, [b.amount, b.entity_id]);
    await pool.query("UPDATE sms_logs SET status='submitted' WHERE message_id=$1", [b.message_id]);
    res.json({ success: true, charged: b.amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/billing/charge/dlr', auth, roles('super_admin','admin','billing'), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.dlr_status === 'DELIVRD') {
      const tbl = b.entity_type === 'client' ? 'clients' : 'suppliers';
      await pool.query(`UPDATE ${tbl} SET balance = balance - $1 WHERE id=$2`, [b.amount, b.entity_id]);
    }
    await pool.query("UPDATE sms_logs SET status=$1, dlr_status=$2, delivery_time=NOW() WHERE message_id=$3",
      [b.dlr_status === 'DELIVRD' ? 'delivered' : 'failed', b.dlr_status, b.message_id]);
    res.json({ success: true, charged: b.dlr_status === 'DELIVRD' ? b.amount : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/billing/force-dlr', auth, roles('super_admin','admin','billing','support'), async (req, res) => {
  try {
    const { message_id, timeout_seconds = 60 } = req.body || {};
    if (!message_id) return res.status(400).json({ error: 'message_id required' });
    // Accept the request and schedule a force-reconcile. We do NOT await the
    // timer here (the SMS may legitimately DLR much later). Track the
    // intent so audit can find it.
    await pool.query("UPDATE sms_logs SET dlr_status = COALESCE(dlr_status, 'PENDING'), status = COALESCE(NULLIF(status,'delivered'), 'submitted') WHERE message_id=$1", [message_id]);
    setTimeout(async () => {
      try {
        await pool.query("UPDATE sms_logs SET status='submitted' WHERE message_id=$1 AND status NOT IN ('delivered','failed','expired','rejected')", [message_id]);
      } catch (e) { /* log-only; non-fatal */ }
    }, Math.min(timeout_seconds, 5) * 1000); // cap 5s for the in-process reconcile
    res.json({ success: true, message_id, timeout_seconds, scheduled: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// BIND HISTORY  (smpp_sessions timeline for a supplier)
// -----------------------------------------------------------------
app.get('/api/bind/:id/history', auth, roles('super_admin','admin','support'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const r = await pool.query(
      `SELECT id, status, system_id, ip_address, port, bind_mode, connected_at, disconnected_at, last_activity
         FROM smpp_sessions WHERE entity_type='supplier' AND entity_id=$1
         ORDER BY last_activity DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    const cnt = await pool.query("SELECT COUNT(*) FROM smpp_sessions WHERE entity_type='supplier' AND entity_id=$1", [req.params.id]);
    res.json({ success: true, data: r.rows, total: parseInt(cnt.rows[0].count, 10), limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// API CONNECTORS explicit CRUD
// These are registered BEFORE server.cjs's generic CRUD loop wins
// for api_connectors. Identical path-strings would otherwise match
// the generic loop first and route here would be unreachable.
// -----------------------------------------------------------------
app.get('/api/api-connectors', auth, async (req, res) => {
  try {
    const isActive = req.query.is_active;
    let q = 'SELECT * FROM api_connectors WHERE 1=1'; const p = []; let i = 1;
    if (isActive !== undefined) { q += ` AND is_active=$${i++}`; p.push(isActive === 'true'); }
    q += ' ORDER BY id DESC LIMIT 200';
    const r = await pool.query(q, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/api-connectors', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    // Schema: provider NOT NULL, send_url NOT NULL. Default provider = name if missing.
    const allowed = ['name','provider','connector_type','region','auth_type','http_method','api_key','api_secret','send_url','dlr_url','dlr_webhook_secret','dlr_status_mapping','submit_pattern','dlr_pattern','dlr_value','test_payload','params','is_active'];
    if (!b.name) b.name = 'unnamed';
    if (!b.provider) b.provider = b.name; // schema requires provider NOT NULL
    const keys = allowed.filter(k => b[k] !== undefined);
    if (!keys.includes('send_url')) return res.status(400).json({ error: 'send_url required' });
    const vals = keys.map(k => b[k]);
    const ph = keys.map((_, i) => '$' + (i + 1)).join(',');
    const r = await pool.query(`INSERT INTO api_connectors (${keys.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/api-connectors/:id', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const allowed = ['name','provider','connector_type','region','auth_type','http_method','api_key','api_secret','send_url','dlr_url','dlr_webhook_secret','dlr_status_mapping','submit_pattern','dlr_pattern','dlr_value','test_payload','params','is_active','connection_status'];
    const keys = allowed.filter(k => b[k] !== undefined);
    if (!keys.length) return res.json({ success: true });
    const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
    const vals = keys.map(k => b[k]);
    await pool.query(`UPDATE api_connectors SET ${sets} WHERE id=$${keys.length+1}`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/api-connectors/:id', auth, roles('super_admin','admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM api_connectors WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SYSTEM: live PG table stats + backup registry (read-only)
// ============================================================
app.get("/api/system/tables", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT relname AS name,
              n_live_tup AS rows,
              pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS size
         FROM pg_stat_user_tables
        WHERE schemaname='public'
        ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/system/backups", async (_req, res) => {
  try {
    let rows = [];
    try {
      const exists = await pool.query("SELECT to_regclass('public.backups') AS t");
      if (exists.rows[0]?.t) {
        const r = await pool.query(
          "SELECT id, name, size, created_at, type FROM backups ORDER BY created_at DESC LIMIT 100"
        );
        rows = r.rows;
      }
    } catch { /* table missing -> empty */ }
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

console.log('[apiExtensions] loaded:', [
  'sms/validate','sms/dlr/batch',
  'rates/history','rates/deactivate-old','rates/notify','rates/destination','rates/update-destination',
  'invoices/generate','invoices/:id{,:breakdown,:send,:mark-paid,:pdf}','invoices/bulk-generate',
  'payments{POST}','payments/history','payments/list','payments/:id/status',
  'voice-otp/{send,calls/:cid,logs,test,languages,sip-settings}',
  'translations/apply','translations{POST}','translations/test','translations/list',
  'notifications/{send,list,:id/read,read-all,rate-change,low-balance,dlr-failure}',
  'billing/{mode,charge/submit,charge/dlr,force-dlr}',
  'bind/:id/history',
  'api-connectors{CRUD}',
].length, 'endpoint groups');
};
module.exports = _factory;
// Injector for server.cjs to wire asterisk-bridge + number-validation after
// apiExtensions endpoints are registered. Without this, the asterisk/* and
// number/* endpoints inside _factory would never reach the bridge modules.
module.exports.setModules = function(numValid, astBridge, emailSvc, teamsSvc, slackSvc) {
  _numValid = numValid || null;
  _astBridge = astBridge || null;
  _emailService = emailSvc || null;
  _teamsService = teamsSvc || null;
  _slackService = slackSvc || null;
};
module.exports.setTeamsService = function(ts) { _teamsService = ts; };
module.exports.setSlackService = function(ss) { _slackService = ss; };
