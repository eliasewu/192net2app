const fs = require('fs');
const p = '/home/ubuntu/net2app-v3/apiExtensions.cjs';
let s = fs.readFileSync(p, 'utf8');
const matches = [...s.matchAll(/^[^\n]*console\.log\(/gm)];
const last = matches[matches.length-1];
if (!last) { console.error('no console.log anchor'); process.exit(2); }
const idx = last.index;
const block = `// ============================================================
// SYSTEM: live PG table stats + backup registry (read-only)
// ============================================================
app.get("/api/system/tables", async (_req, res) => {
  try {
    const r = await pool.query(
      \`SELECT relname AS name,
              n_live_tup AS rows,
              pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS size
         FROM pg_stat_user_tables
        WHERE schemaname='public'
        ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC\`
    );
    res.json({ success: true, data: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

`;
s = s.slice(0, idx) + block + s.slice(idx);
fs.writeFileSync(p, s);
console.log('Inserted at offset', idx, 'final length', s.length);
