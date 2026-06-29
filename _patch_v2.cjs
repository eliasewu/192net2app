// Apply remaining fixes: DatabasePage/BackupPage real DB, 2 new endpoints, strip Math.random fallbacks, BulkUpload wires to addRate.
const fs = require('fs');

function patch(path, edits) {
  let src = fs.readFileSync(path, 'utf8');
  let nApplied = 0;
  for (const [name, oldStr, newStr] of edits) {
    if (!oldStr || oldStr.length < 6) { console.error(`  [${name}] invalid oldStr`); continue; }
    if (!src.includes(oldStr)) {
      console.warn(`  [${name}] not found in ${path}`);
      continue;
    }
    src = src.replace(oldStr, newStr);
    nApplied++;
    console.log(`  [${name}] applied`);
  }
  fs.writeFileSync(path, src);
  console.log(`Wrote ${src.length} bytes to ${path} (${nApplied}/${edits.length} edits applied)`);
}

// =============================================================
// 1) RemainingPages.tsx — replace hardcoded DatabasePage + BackupPage, strip Math.random fallbacks, wire BulkUpload
// =============================================================
const rmpPath = '/home/ubuntu/net2app-v3/src/pages/RemainingPages.tsx';
let rmp = fs.readFileSync(rmpPath, 'utf8');
const rmpSizeBefore = rmp.length;

// A) DatabasePage: replace the entire `tables=[{name:'clients',rows:5...` block with state + fetch
const dbOld = `// ==================== DATABASE & BACKUP ====================\nexport const DatabasePage: React.FC = () => {\n  const tables=[{name:'clients',rows:5,size:'2.4MB'},{name:'suppliers',rows:7,size:'3.1MB'},{name:'sms_logs',rows:125000,size:'45MB'},{name:'rates',rows:15,size:'1.2MB'},{name:'invoices',rows:4,size:'0.8MB'},{name:'payments',rows:4,size:'0.5MB'},{name:'mccmnc',rows:15,size:'0.3MB'},{name:'routes',rows:4,size:'0.2MB'},{name:'trunks',rows:7,size:'0.6MB'},{name:'users',rows:5,size:'0.4MB'}];`;
const dbNew = `// ==================== DATABASE & BACKUP (real DB stats) ====================\nexport const DatabasePage: React.FC = () => {\n  const [tables, setTables] = React.useState<{name:string; rows:number; size:string}[]>([]);\n  const [loading, setLoading] = React.useState(true);\n  const reload = async () => {\n    setLoading(true);\n    try { const r:any = await api.get('/system/tables'); setTables(Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : [])); } catch { setTables([]); }\n    finally { setLoading(false); }\n  };\n  React.useEffect(() => { reload(); }, []);`;

if (rmp.includes(dbOld)) { rmp = rmp.replace(dbOld, dbNew); console.log('[rmp] DatabasePage tables array replaced'); } else { console.warn('[rmp] DatabasePage dbOld not found'); }

// B) BackupPage: replace the hardcoded useState
// Find `export const BackupPage: React.FC = () => {\n  const [backups]=useState([`
const bkOld = `export const BackupPage: React.FC = () => {\n  const [backups]=useState([`;
const bkNew = `export const BackupPage: React.FC = () => {\n  const [backups, setBackups] = React.useState<any[]>([]);\n  const [loading, setLoading] = React.useState(true);\n  const reload = async () => {\n    setLoading(true);\n    try { const r:any = await api.get('/system/backups'); setBackups(Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : [])); } catch { setBackups([]); }\n    finally { setLoading(false); }\n  };\n  React.useEffect(() => { reload(); }, []);\n  const _orig = useState([`;

if (rmp.includes(bkOld)) { rmp = rmp.replace(bkOld, bkNew); console.log('[rmp] BackupPage useState replaced'); } else { console.warn('[rmp] BackupPage bkOld not found'); }

// C) DatabasePage table wrapper — guard with loading/empty
const dbTableOld = `<Card title="Database Tables" noPadding><Table columns={cols} data={tables} keyExtractor={t=>t.name}/></Card>`;
const dbTableNew = `<Card title="Database Tables" noPadding>{loading?<p className="text-gray-500 text-center py-8">Loading live stats…</p>:tables.length===0?<p className="text-gray-500 text-center py-8">No tables yet.</p>:<Table columns={cols} data={tables} keyExtractor={t=>t.name}/>}</Card>`;
if (rmp.includes(dbTableOld)) { rmp = rmp.replace(dbTableOld, dbTableNew); console.log('[rmp] DatabaseTable wrapper guarded'); }

// D) BackupPage table wrapper — guard
const bkTableOld = `<Card title="Backup Files" noPadding><Table columns={cols} data={backups} keyExtractor={(b:any)=>b.id}/></Card>`;
const bkTableNew = `<Card title="Backup Files" noPadding>{loading?<p className="text-gray-500 text-center py-8">Loading…</p>:backups.length===0?<p className="text-gray-500 text-center py-8">No backups registered yet.</p>:<Table columns={cols} data={backups} keyExtractor={(b:any)=>b.id||b.name}/>}</Card>`;
if (rmp.includes(bkTableOld)) { rmp = rmp.replace(bkTableOld, bkTableNew); console.log('[rmp] BackupTable wrapper guarded'); }

// E) DatabasePage stats — drop hardcoded 54.9 MB, totalRows is computed from real data
const dbTotalOld = `<div className="bg-white rounded-xl p-4 border"><FileText size={24} className="text-green-500 mb-1"/><p className="text-2xl font-bold">{(tables.reduce((s,t)=>s+t.rows,0)).toLocaleString()}</p>`;
const dbTotalNew = `<div className="bg-white rounded-xl p-4 border"><FileText size={24} className="text-green-500 mb-1"/><p className="text-2xl font-bold">{tables.reduce((s,t)=>s+(Number(t.rows)||0),0).toLocaleString()}</p>`;
if (rmp.includes(dbTotalOld)) { rmp = rmp.replace(dbTotalOld, dbTotalNew); console.log('[rmp] DatabasePage totalRows computed'); }
const dbSizeOld = `<div className="bg-white rounded-xl p-4 border"><HardDrive size={24} className="text-purple-500 mb-1"/><p className="text-2xl font-bold">54.9 MB</p>`;
const dbSizeNew = `<div className="bg-white rounded-xl p-4 border"><HardDrive size={24} className="text-purple-500 mb-1"/><p className="text-2xl font-bold">—</p>`;
if (rmp.includes(dbSizeOld)) { rmp = rmp.replace(dbSizeOld, dbSizeNew); console.log('[rmp] DatabasePage size placeholder'); }

// F) BackupPage created_at column
const bkColOld = `{key:'created',header:'Created',render:(b:any)=><span className="text-sm">{new Date(b.created).toLocaleString()}</span>}`;
const bkColNew = `{key:'created',header:'Created',render:(b:any)=><span className="text-sm">{b.created_at?new Date(b.created_at).toLocaleString():'—'}</span>}`;
if (rmp.includes(bkColOld)) { rmp = rmp.replace(bkColOld, bkColNew); console.log('[rmp] BackupPage col.created_at'); }

// G) BackupPage Create button — disable (no API yet) + add Refresh
const bkCreateOld = `<Button icon={<Plus size={18}/>}>Create Backup</Button>`;
const bkCreateNew = `<Button icon={<Plus size={18}/>} onClick={()=>alert('Schedule via cron / pg_dump on the host.')} disabled>Create Backup</Button>`;
if (rmp.includes(bkCreateOld)) { rmp = rmp.replace(bkCreateOld, bkCreateNew); console.log('[rmp] BackupPage Create disabled'); }
const bkCreateWrapOld = `<h1 className="text-2xl font-bold text-gray-800">Backup & Restore</h1><p className="text-gray-500 mt-1">Database backups</p></div><Button icon={<Plus size={18}/>} onClick={()=>alert('Schedule via cron / pg_dump on the host.')} disabled>Create Backup</Button></div>`;
const bkCreateWrapNew = `<h1 className="text-2xl font-bold text-gray-800">Backup & Restore</h1><p className="text-gray-500 mt-1">{backups.length} backups from database</p></div><div className="flex gap-2"><Button variant="secondary" onClick={reload}>Refresh</Button><Button icon={<Plus size={18}/>} onClick={()=>alert('Schedule via cron / pg_dump on the host.')} disabled>Create Backup</Button></div></div>`;
if (rmp.includes(bkCreateWrapOld)) { rmp = rmp.replace(bkCreateWrapOld, bkCreateWrapNew); console.log('[rmp] BackupPage header Refresh'); }

// H) Strip Math.random() fallbacks in chart generators — show 0 instead of fake numbers
// RealtimeReport
const rtOld = `sms:smsLogs.filter(l=>{const d=new Date(l.submit_time);return d.getMinutes()===i%60&&d.getHours()===Math.floor(i/60);}).length||Math.floor(Math.random()*50+10)`;
const rtNew = `sms:smsLogs.filter(l=>{const d=new Date(l.submit_time);return d.getMinutes()===i%60&&d.getHours()===Math.floor(i/60);}).length`;
if (rmp.includes(rtOld)) { rmp = rmp.replace(rtOld, rtNew); console.log('[rmp] RealtimeReport Math.random stripped'); }
// HourlyReport
const hrOld = `,sms:sent||Math.floor(Math.random()*50+10),del:del||Math.floor(sent*0.9),fail:fail||Math.floor(sent*0.1)}`;
const hrNew = `,sms:sent,del:del,fail:fail}`;
if (rmp.includes(hrOld)) { rmp = rmp.replace(hrOld, hrNew); console.log('[rmp] HourlyReport Math.random stripped'); }
// DailyReport
const drOld = `,sms:cnt||Math.floor(Math.random()*1000+100),rev:rev||Math.floor(Math.random()*50+5),cost:cost||Math.floor(Math.random()*30+3),profit:rev-cost}}`;
const drNew = `,sms:cnt,rev:rev,cost:cost,profit:rev-cost}}`;
if (rmp.includes(drOld)) { rmp = rmp.replace(drOld, drNew); console.log('[rmp] DailyReport Math.random stripped'); }
// MonthlyReport
const mrOld = `const cnt=moLogs.length||Math.floor(Math.random()*50000+10000);const rev=moLogs.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0)||cnt*0.03;const cost=moLogs.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0)||cnt*0.018;`;
const mrNew = `const cnt=moLogs.length;const rev=moLogs.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0);const cost=moLogs.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0);`;
if (rmp.includes(mrOld)) { rmp = rmp.replace(mrOld, mrNew); console.log('[rmp] MonthlyReport Math.random stripped'); }
// BillingOverview
const boOld = `const chartData = smsLogs.length > 0 ? Array.from({length:12},(_,i)=>{const m=\`2024-\${String(i+1).padStart(2,'0')}\`;const ml=smsLogs.filter(l=>l.submit_time.startsWith(m));const rev=ml.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0);const cost=ml.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0);return {month:m,revenue:rev||Math.floor(Math.random()*5000+1000),cost:cost||Math.floor(Math.random()*3000+500),profit:(rev-cost)||Math.floor(Math.random()*2000+500)};}) : Array.from({length:12},(_,i)=>({month:\`2024-\${String(i+1).padStart(2,'0')}\`,revenue:Math.floor(Math.random()*50000+20000),cost:Math.floor(Math.random()*30000+10000),profit:Math.floor(Math.random()*20000+5000)}));`;
const boNew = `const chartData = Array.from({length:12},(_,i)=>{const m=\`2024-\${String(i+1).padStart(2,'0')}\`;const ml=smsLogs.filter(l=>l.submit_time.startsWith(m));const rev=ml.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0);const cost=ml.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0);return {month:m,revenue:rev,cost:cost,profit:rev-cost};});`;
if (rmp.includes(boOld)) { rmp = rmp.replace(boOld, boNew); console.log('[rmp] BillingOverview Math.random stripped'); }

// I) Wire BulkUpload "Import Data" to addRate. Use api.post('/rates/bulk') if it exists or addRate per-row.
const fuOld = `Button variant="success" onClick={()=>{setCsvData('');alert('Data imported!');}}>Import Data</Button>`;
const fuNew = `Button variant="success" onClick={async()=>{const lines=(csvData||'').trim().split('\\n').filter(Boolean);let ok=0,fail=0;for(const line of lines){const p=line.split(',').map(x=>x.trim());if(p.length>=6&&type==='rates'){try{await api.post('/rates',{entity_type:'client',entity_id:p[0],mcc:p[1],mnc:p[2]||'*',country:p[3],operator:p[4]||'All',rate:parseFloat(p[5])||0,currency:'EUR',effective_from:new Date().toISOString().split('T')[0],effective_to:null,is_active:true});ok++;}catch{fail++;}}else if(p.length>=4&&type==='mccmnc'){try{await api.post('/mccmnc',{country:p[0],mcc:p[1],mnc:p[2]||'',operator:p[3]||'All',is_active:true});ok++;}catch{fail++;}}else fail++;}setCsvData('');alert(\`Imported \${ok} ok / \${fail} failed\`);}}>Import Data</Button>`;
if (rmp.includes(fuOld)) { rmp = rmp.replace(fuOld, fuNew); console.log('[rmp] BulkUpload wired to api.post'); }

fs.writeFileSync(rmpPath, rmp);
console.log(`\nWrote ${rmp.length} bytes to ${rmpPath} (delta ${rmp.length - rmpSizeBefore})`);

// =============================================================
// 2) apiExtensions.cjs — add /api/system/tables and /api/system/backups
// =============================================================
const apiPath = '/home/ubuntu/net2app-v3/apiExtensions.cjs';
let api = fs.readFileSync(apiPath, 'utf8');
const anchor = 'console.log("[API] External client API loaded';
if (!api.includes(anchor)) { console.error('[api] anchor not found'); process.exit(2); }
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
api = api.replace(anchor, block + anchor);
fs.writeFileSync(apiPath, api);
console.log(`\nWrote ${api.length} bytes to ${apiPath} (added /api/system/* endpoints)`);
