module.exports = function(app, pool, auth) {

// Helper: Authenticate by API key OR username/password
async function authClient(req, res) {
  const apiKey = req.headers["x-api-key"];
  const username = req.body.username || req.query.username;
  const password = req.body.password || req.query.password;
  
  // Try API key first
  if (apiKey) {
    const r = await pool.query("SELECT * FROM clients WHERE api_key=$1 AND status='active' AND api_enabled=true", [apiKey]);
    if (r.rows.length) return r.rows[0];
  }
  
  // Try username/password
  if (username && password) {
    const r = await pool.query("SELECT * FROM clients WHERE smpp_username=$1 AND smpp_password=$2 AND status='active'", [username, password]);
    if (r.rows.length) return r.rows[0];
  }
  
  res.status(401).json({ error: "Authentication required. Use X-API-Key header or username+password in body." });
  return null;
}

// SMS Send
app.post("/api/v1/sms/send", async (req, res) => {
  try {
    const client = await authClient(req, res);
    if (!client) return;
    const c = client;
    const { to, from, text, dlr_url } = req.body;
    if (!to || !text) return res.status(400).json({ error: "to and text are required" });
    const messageId = "MSG" + Date.now() + Math.random().toString(36).substr(2,6);
    const parts = Math.ceil(text.length / 160);
    const rate = 0.025;
    const cost = rate * parts;
    await pool.query(
      "INSERT INTO sms_logs (message_id, client_id, client_code, sender_id, destination, message, message_parts, client_rate, status, submit_time, dlr_callback_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',NOW(),$9)",
      [messageId, c.id, c.client_code, from || c.smpp_username, to, text, parts, rate, dlr_url || null]
    );
    res.json({ success: true, data: { message_id: messageId, to, from, text, parts, rate, currency: "EUR", cost, profit: 0.01, status: "submitted", submitted_at: new Date().toISOString() }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DLR Query
app.get("/api/v1/sms/dlr/:messageId", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    const username = req.query.username;
    const password = req.query.password;
    let clientId = null;
    if (apiKey) { const r = await pool.query("SELECT id FROM clients WHERE api_key=$1", [apiKey]); if (r.rows.length) clientId = r.rows[0].id; }
    else if (username && password) { const r = await pool.query("SELECT id FROM clients WHERE smpp_username=$1 AND smpp_password=$2", [username, password]); if (r.rows.length) clientId = r.rows[0].id; }
    if (!clientId) return res.status(401).json({ error: "Authentication required" });
    const r = await pool.query("SELECT message_id, destination, status, dlr_status, submit_time, delivery_time FROM sms_logs WHERE message_id=$1 AND client_id=$2", [req.params.messageId, clientId]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Balance
app.get("/api/v1/account/balance", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    const username = req.query.username;
    const password = req.query.password;
    let client = null;
    if (apiKey) { const r = await pool.query("SELECT * FROM clients WHERE api_key=$1", [apiKey]); if (r.rows.length) client = r.rows[0]; }
    else if (username && password) { const r = await pool.query("SELECT * FROM clients WHERE smpp_username=$1 AND smpp_password=$2", [username, password]); if (r.rows.length) client = r.rows[0]; }
    if (!client) return res.status(401).json({ error: "Authentication required" });
    const c = client;
    res.json({ success: true, data: { balance: parseFloat(c.balance), credit_limit: parseFloat(c.credit_limit||0), available: parseFloat(c.balance)+parseFloat(c.credit_limit||0), currency: c.currency||"EUR", billing_mode: c.billing_mode } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

console.log("[API] External client API loaded (auth: API key or username/password)");
};
