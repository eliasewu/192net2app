// External REST API for clients (SMS send, DLR, balance)
module.exports = function(app, pool, auth) {

// SMS Send
app.post("/api/v1/sms/send", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "API key required" });
    const client = await pool.query("SELECT * FROM clients WHERE api_key=$1 AND status='active'", [apiKey]);
    if (!client.rows.length) return res.status(401).json({ error: "Invalid API key" });
    const c = client.rows[0];
    const { destination, sender_id, message } = req.body;
    if (!destination || !message) return res.status(400).json({ error: "destination and message required" });
    const messageId = "API_" + Date.now() + "_" + Math.random().toString(36).substr(2,9);
    const parts = Math.ceil(message.length / 160);
    const cost = 0.025 * parts;
    await pool.query(
      "INSERT INTO sms_logs (message_id, client_id, client_code, sender_id, destination, message, message_parts, client_rate, status, submit_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',NOW())",
      [messageId, c.id, c.client_code, sender_id || c.smpp_username, destination, message, parts, 0.025]
    );
    res.json({ success: true, message_id: messageId, destination, parts, cost, status: "submitted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DLR Query
app.get("/api/v1/sms/dlr/:messageId", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "API key required" });
    const client = await pool.query("SELECT id FROM clients WHERE api_key=$1", [apiKey]);
    if (!client.rows.length) return res.status(401).json({ error: "Invalid API key" });
    const r = await pool.query("SELECT message_id, destination, status, dlr_status, submit_time, delivery_time FROM sms_logs WHERE message_id=$1 AND client_id=$2", [req.params.messageId, client.rows[0].id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Balance
app.get("/api/v1/account/balance", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "API key required" });
    const client = await pool.query("SELECT * FROM clients WHERE api_key=$1", [apiKey]);
    if (!client.rows.length) return res.status(401).json({ error: "Invalid API key" });
    const c = client.rows[0];
    res.json({ success: true, client_code: c.client_code, balance: parseFloat(c.balance), credit_limit: parseFloat(c.credit_limit||0), total: parseFloat(c.balance)+parseFloat(c.credit_limit||0), currency: c.currency||"EUR" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SMS Logs
app.post("/api/v1/sms/logs", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "API key required" });
    const client = await pool.query("SELECT id FROM clients WHERE api_key=$1", [apiKey]);
    if (!client.rows.length) return res.status(401).json({ error: "Invalid API key" });
    const { page, limit } = req.body;
    const pg = Math.max(1, parseInt(page) || 1);
    const lm = Math.min(100, parseInt(limit) || 50);
    const offset = (pg - 1) * lm;
    const count = await pool.query("SELECT count(*) FROM sms_logs WHERE client_id=" + client.rows[0].id);
    const logs = await pool.query("SELECT * FROM sms_logs WHERE client_id=" + client.rows[0].id + " ORDER BY submit_time DESC LIMIT " + lm + " OFFSET " + offset);
    res.json({ success: true, total: parseInt(count.rows[0].count), page: pg, limit: lm, data: logs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

console.log("[API] External client API loaded: /api/v1/sms/send, /api/v1/sms/dlr, /api/v1/account/balance");
};
