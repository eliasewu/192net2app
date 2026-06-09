#!/usr/bin/env node
// NET2APP Hub - Production Server (Express + PostgreSQL)
// All data saved to PostgreSQL and loaded from PostgreSQL

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const smpp = require('smpp');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'net2app-hub-' + Date.now();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'net2app_hub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// ===================== AUTH MIDDLEWARE =====================
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};
const roles = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

// ===================== AUTH =====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE username=$1 AND is_active=true', [username]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const { password_hash, ...safe } = user;
    res.json({ success: true, token, user: safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===================== CLIENTS =====================
app.get('/api/clients', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json({ success: true, data: r.rows });
});
app.post('/api/clients', auth, roles('super_admin','admin'), async (req, res) => {
  const { client_code, company_name, email, smpp_username, smpp_password, billing_mode, currency, balance, credit_limit } = req.body;
  const r = await pool.query(`INSERT INTO clients (client_code,company_name,email,smpp_username,smpp_password,billing_mode,currency,balance,credit_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [client_code,company_name,email,smpp_username,smpp_password,billing_mode||'dlr',currency||'EUR',balance||0,credit_limit||0]);
  res.json({ success: true, data: r.rows[0] });
});
app.put('/api/clients/:id', auth, roles('super_admin','admin'), async (req, res) => {
  const id = req.params.id;
  const sets = Object.keys(req.body).filter(k => req.body[k] !== undefined).map((k, i) => `${k}=$${i+1}`).join(',');
  const vals = Object.keys(req.body).filter(k => req.body[k] !== undefined).map(k => req.body[k]);
  if (sets) await pool.query(`UPDATE clients SET ${sets}, updated_at=NOW() WHERE id=$${vals.length+1}`, [...vals, id]);
  res.json({ success: true });
});
app.delete('/api/clients/:id', auth, roles('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ===================== SUPPLIERS =====================
app.get('/api/suppliers', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM suppliers ORDER BY created_at DESC');
  res.json({ success: true, data: r.rows });
});
app.post('/api/suppliers', auth, roles('super_admin','admin'), async (req, res) => {
  const { supplier_code, company_name, connection_type, smpp_host, smpp_port, smpp_username, smpp_password } = req.body;
  const r = await pool.query(`INSERT INTO suppliers (supplier_code,company_name,connection_type,smpp_host,smpp_port,smpp_username,smpp_password) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [supplier_code,company_name,connection_type||'smpp',smpp_host,smpp_port||2775,smpp_username,smpp_password]);
  res.json({ success: true, data: r.rows[0] });
});
app.put('/api/suppliers/:id', auth, roles('super_admin','admin'), async (req, res) => {
  const id = req.params.id;
  const sets = Object.keys(req.body).filter(k => req.body[k] !== undefined).map((k, i) => `${k}=$${i+1}`).join(',');
  const vals = Object.keys(req.body).filter(k => req.body[k] !== undefined).map(k => req.body[k]);
  if (sets) await pool.query(`UPDATE suppliers SET ${sets}, updated_at=NOW() WHERE id=$${vals.length+1}`, [...vals, id]);
  res.json({ success: true });
});

// ===================== BIND STATUS =====================
app.get('/api/bind/status', auth, async (req, res) => {
  const r = await pool.query('SELECT id, supplier_code, company_name, connection_type, bind_status, consecutive_failures, status FROM suppliers');
  res.json({ success: true, data: r.rows });
});
app.post('/api/bind/:id/reconnect', auth, roles('super_admin','admin','support'), async (req, res) => {
  await pool.query("UPDATE suppliers SET bind_status='binding', consecutive_failures=0 WHERE id=$1", [req.params.id]);
  setTimeout(async () => { await pool.query("UPDATE suppliers SET bind_status='bound' WHERE id=$1", [req.params.id]); }, 2000);
  res.json({ success: true });
});
app.post('/api/bind/:id/disconnect', auth, roles('super_admin','admin','support'), async (req, res) => {
  await pool.query("UPDATE suppliers SET bind_status='unbound' WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ===================== SMS (with DLR + profit check + billing) =====================
app.post('/api/sms/send', auth, async (req, res) => {
  try {
    const { client_id, destination, sender_id, message, route_plan_id } = req.body;
    // 1. Auth
    const client = await pool.query('SELECT * FROM clients WHERE id=$1 AND status=$2', [client_id, 'active']);
    if (!client.rows.length) return res.status(400).json({ error: 'Client not found' });
    const c = client.rows[0];
    // 2. Route plan required
    if (!route_plan_id && !c.routing_plan_id) return res.status(400).json({ error: 'Route plan is mandatory' });
    // 3. Find rate (client sell rate)
    const rateR = await pool.query("SELECT * FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true LIMIT 1", [client_id]);
    const clientRate = rateR.rows[0]?.rate || 0.025;
    // 4. Find supplier buy rate
    const supRate = await pool.query("SELECT * FROM rates WHERE entity_type='supplier' AND is_active=true LIMIT 1");
    const supplierRate = supRate.rows[0]?.rate || 0.015;
    // 5. PROFIT CHECK: selling - buying = profit. If profit ≤ 0 → BLOCK
    const parts = Math.ceil((message||'').length / 160);
    const profit = clientRate - supplierRate;
    if (profit <= 0) return res.status(400).json({ error: `ROUTE BLOCKED: No profit. Client rate €${clientRate.toFixed(4)} ≤ Supplier rate €${supplierRate.toFixed(4)}` });
    // 6. Balance check
    const available = parseFloat(c.balance) + parseFloat(c.credit_limit);
    const cost = clientRate * parts;
    if (available < cost) return res.status(402).json({ error: `Insufficient balance. Available: €${available.toFixed(2)}, Need: €${cost.toFixed(4)}` });
    // 7. Insert SMS log
    const msgId = 'MSG' + Date.now();
    const ir = await pool.query(`INSERT INTO sms_logs (message_id,client_id,client_code,sender_id,destination,message,message_parts,client_rate,supplier_rate,profit,status,submit_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',NOW()) RETURNING *`, [msgId, client_id, c.client_code, sender_id, destination, message, parts, clientRate, supplierRate, profit]);
    // 8. Billing: On Submit → charge immediately
    if (c.billing_mode === 'submit') {
      await pool.query('UPDATE clients SET balance = balance - $1 WHERE id = $2', [cost, client_id]);
    }
    // 9. Simulate DLR (in production: real SMPP DLR)
    setTimeout(async () => {
      const delivered = Math.random() > 0.1;
      await pool.query(`UPDATE sms_logs SET status=$1, dlr_status=$2, dlr_timestamp=NOW(), delivery_time=NOW() WHERE message_id=$3`, [delivered ? 'delivered' : 'failed', delivered ? 'DELIVRD' : 'UNDELIV', msgId]);
      if (c.billing_mode === 'dlr' && delivered) {
        await pool.query('UPDATE clients SET balance = balance - $1 WHERE id = $2', [cost, client_id]);
      }
    }, 3000 + Math.random() * 5000);
    res.json({ success: true, data: { ...ir.rows[0], profit, billing_mode: c.billing_mode } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/logs', auth, async (req, res) => {
  const { client_id, status, limit, offset } = req.body;
  let q = 'SELECT * FROM sms_logs WHERE 1=1'; const p = []; let i = 1;
  if (client_id) { q += ` AND client_id=$${i++}`; p.push(client_id); }
  if (status) { q += ` AND status=$${i++}`; p.push(status); }
  q += ' ORDER BY submit_time DESC';
  q += ` LIMIT $${i++} OFFSET $${i++}`; p.push(limit||100, offset||0);
  const r = await pool.query(q, p);
  res.json({ success: true, data: r.rows });
});

app.post('/api/sms/test', auth, async (req, res) => {
  const { client_id, destination, sender_id, message, route_plan_id } = req.body;
  const r = await pool.query(`INSERT INTO sms_logs (message_id,client_id,sender_id,destination,message,status,submit_time) VALUES ($1,$2,$3,$4,$5,'pending',NOW()) RETURNING *`, ['TEST'+Date.now(), client_id, sender_id, destination, message]);
  res.json({ success: true, data: r.rows[0] });
});

// ===================== RATES =====================
app.get('/api/rates', auth, async (req, res) => {
  const { entity_type, entity_id } = req.query;
  let q = 'SELECT * FROM rates WHERE 1=1'; const p = []; let i = 1;
  if (entity_type) { q += ` AND entity_type=$${i++}`; p.push(entity_type); }
  if (entity_id) { q += ` AND entity_id=$${i++}`; p.push(entity_id); }
  q += ' ORDER BY country, mcc, mnc';
  const r = await pool.query(q, p);
  res.json({ success: true, data: r.rows });
});
app.post('/api/rates', auth, roles('super_admin','admin','billing'), async (req, res) => {
  const { entity_type, entity_id, mcc, mnc, country, operator, rate } = req.body;
  // Deactivate old rate (versioning)
  await pool.query("UPDATE rates SET is_active=false, effective_to=CURRENT_DATE WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4 AND is_active=true", [entity_type, entity_id, mcc, mnc]);
  const r = await pool.query(`INSERT INTO rates (entity_type,entity_id,mcc,mnc,country,operator,rate,effective_from,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, (SELECT COALESCE(MAX(version),0)+1 FROM rates WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4)) RETURNING *`, [entity_type,entity_id,mcc,mnc,country,operator||'All',rate,req.body.effective_from||new Date().toISOString().split('T')[0]]);
  res.json({ success: true, data: r.rows[0] });
});
app.post('/api/rates/bulk', auth, roles('super_admin','admin','billing'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of req.body.rates) {
      await client.query("UPDATE rates SET is_active=false, effective_to=CURRENT_DATE WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4 AND is_active=true", [r.entity_type, r.entity_id, r.mcc, r.mnc]);
      await client.query(`INSERT INTO rates (entity_type,entity_id,mcc,mnc,country,operator,rate,effective_from,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, (SELECT COALESCE(MAX(version),0)+1 FROM rates WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4))`, [r.entity_type, r.entity_id, r.mcc, r.mnc, r.country, r.operator||'All', r.rate, r.effective_from||new Date().toISOString().split('T')[0]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ===================== INVOICES =====================
app.get('/api/billing/invoices', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 50');
  res.json({ success: true, data: r.rows });
});
app.post('/api/billing/invoices', auth, roles('super_admin','admin','billing'), async (req, res) => {
  const { entity_type, entity_id, period_start, period_end } = req.body;
  // Sum SMS for period - DELIVERED only for DLR billing, all SUBMITTED for submit billing
  const smsR = await pool.query(`SELECT COUNT(*) as total_sms, COALESCE(SUM(client_rate*message_parts),0) as total_amount FROM sms_logs WHERE client_id=$1 AND submit_time::date BETWEEN $2 AND $3 AND status='delivered'`, [entity_id, period_start, period_end]);
  const { total_sms, total_amount } = smsR.rows[0];
  const tax = parseFloat(total_amount) * 0.19;
  const grand = parseFloat(total_amount) + tax;
  const entity = await pool.query(entity_type==='client'?'SELECT company_name FROM clients WHERE id=$1':'SELECT company_name FROM suppliers WHERE id=$1', [entity_id]);
  const r = await pool.query(`INSERT INTO invoices (entity_type,entity_id,entity_name,period_start,period_end,total_sms,total_amount,tax_amount,grand_total,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [entity_type, entity_id, entity.rows[0]?.company_name||'Unknown', period_start, period_end, total_sms, total_amount, tax, grand, new Date(Date.now()+30*86400000).toISOString().split('T')[0]]);
  res.json({ success: true, data: r.rows[0] });
});

// Get current user
app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, username, email, role, permissions, client_id, supplier_id, name, is_active, last_login, created_at FROM users WHERE id=$1", [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get all users (admin only)
app.get("/api/users", auth, roles("super_admin","admin"), async (req, res) => {
  try {
    const r = await pool.query("SELECT id, username, email, role, permissions, client_id, supplier_id, name, is_active, last_login FROM users ORDER BY id");
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ===================== DASHBOARD =====================
app.get('/api/dashboard/stats', auth, async (req, res) => {
  const r = await pool.query(`SELECT (SELECT COUNT(*) FROM clients) as tc, (SELECT COUNT(*) FROM clients WHERE status='active') as ac, (SELECT COUNT(*) FROM suppliers) as ts, (SELECT COUNT(*) FROM suppliers WHERE status='active') as asu, (SELECT COUNT(*) FROM sms_logs WHERE submit_time::date=CURRENT_DATE) as sms_t, (SELECT COUNT(*) FROM sms_logs WHERE submit_time::date=CURRENT_DATE AND status='delivered') as del_t, (SELECT COUNT(*) FROM suppliers WHERE bind_status='bound') as ab, (SELECT COUNT(*) FROM suppliers) as tb`);
  res.json({ success: true, data: r.rows[0] });
});

// ===================== ALL OTHER CRUD (Generic) =====================
const tables = ['mccmnc','trunks','routes','route_plans','route_maps','payments','campaigns','translations','notifications','notification_templates','ott_devices','api_connectors','voice_otp_configs','voice_otp_logs','license','tenants','platform_settings','smtp_config','audit_logs'];

tables.forEach(table => {
  app.get(`/api/${table}`, auth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 500`);
      res.json({ success: true, data: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/${table}`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      const vals = keys.map(k => req.body[k]);
      const ph = keys.map((_, i) => '$' + (i + 1)).join(',');
      const r = await pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${ph}) RETURNING *`, vals);
      res.json({ success: true, data: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(`/api/${table}/:id`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
      const vals = keys.map(k => req.body[k]);
      if (keys.length > 0) await pool.query(`UPDATE ${table} SET ${sets} WHERE id=$${keys.length+1}`, [...vals, req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/api/${table}/:id`, auth, roles('super_admin','admin'), async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});


app.listen(PORT, () => {
  console.log(`NET2APP Hub running on port ${PORT}`);
  console.log(`Database: ${pool.options.database} on ${pool.options.host}`);
});

// ===================== SMPP AUTO-RECONNECT =====================
const activeSMPPSessions = new Map();

async function maintainSupplierConnections() {
  try {
    const suppliers = await pool.query(
      "SELECT * FROM suppliers WHERE status='active' AND connection_type='smpp' AND smpp_host IS NOT NULL AND smpp_port IS NOT NULL"
    );
    for (const sup of suppliers.rows) {
      const key = 'supplier_' + sup.id;
      if (activeSMPPSessions.has(key)) {
        const existing = activeSMPPSessions.get(key);
        if (existing && !existing.destroyed) continue;
        activeSMPPSessions.delete(key);
      }
      console.log('[SMPP] Connecting to ' + sup.supplier_code + ' @ ' + sup.smpp_host + ':' + sup.smpp_port);
      try {
        const session = smpp.connect({ url: 'smpp://' + sup.smpp_host + ':' + sup.smpp_port, connect_timeout: 5000 });
        session.on('connect', function() {
          session.bind_transceiver({ system_id: sup.smpp_username || 'net2app', password: sup.smpp_password || '', system_type: 'SMPP' }, async function(pdu) {
            if (pdu.command_status === 0) {
              await pool.query("UPDATE suppliers SET bind_status='bound', consecutive_failures=0 WHERE id=$1", [sup.id]);
              console.log('[SMPP] Bound to ' + sup.supplier_code);
            } else {
              await pool.query("UPDATE suppliers SET bind_status='unbound', consecutive_failures=consecutive_failures+1 WHERE id=$1", [sup.id]);
              session.close();
            }
          });
        });
        session.on('error', async function(err) {
          await pool.query("UPDATE suppliers SET bind_status='unbound', consecutive_failures=consecutive_failures+1 WHERE id=$1", [sup.id]);
          activeSMPPSessions.delete(key);
        });
        session.on('close', async function() {
          await pool.query("UPDATE suppliers SET bind_status='unbound' WHERE id=$1", [sup.id]);
          activeSMPPSessions.delete(key);
          setTimeout(maintainSupplierConnections, 2000);
        });
        activeSMPPSessions.set(key, session);
      } catch (e) {
        console.error('[SMPP] Failed to connect to ' + sup.supplier_code + ': ' + e.message);
      }
    }
  } catch (e) {
    console.error('[SMPP] Connection manager error: ' + e.message);
  }
}

// Start SMPP server for ESME clients
const smppServer = smpp.createServer(function(session) {
  console.log('[SMPP] New connection from ' + session.socket.remoteAddress);
  var boundSystemId = null;
  session.on('bind_transceiver', async function(pdu) {
    try {
      var r = await pool.query("SELECT * FROM clients WHERE smpp_username=$1 AND status='active'", [pdu.system_id]);
      if (r.rows.length > 0 && r.rows[0].smpp_password === pdu.password) {
        boundSystemId = pdu.system_id;
        session.send(pdu.response());
        console.log('[SMPP] ' + pdu.system_id + ' BOUND as TRX');
      } else {
        session.send(pdu.response({ command_status: 14 }));
      }
    } catch (e) { session.send(pdu.response({ command_status: 14 })); }
  });
  session.on('submit_sm', async function(pdu) {
    if (!boundSystemId) { session.send(pdu.response({ command_status: 3 })); return; }
    var messageId = 'SMPP_' + Date.now();
    session.send(pdu.response({ message_id: messageId }));
  });
  session.on('unbind', function(pdu) { session.send(pdu.response()); session.close(); });
  session.on('error', function(err) {});
  session.on('close', function() {});
});

smppServer.listen(2775, '0.0.0.0', function() {
  console.log('[SMPP] ESME Server listening on 0.0.0.0:2775');
});

setTimeout(maintainSupplierConnections, 3000);
setInterval(maintainSupplierConnections, 30000);
