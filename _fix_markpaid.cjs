const fs = require('fs');
const path = '/home/ubuntu/net2app-v3/apiExtensions.cjs';
let src = fs.readFileSync(path, 'utf8');
const anchor = `    await conn.query(\`UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=$1\`, [req.params.id]);`;
const replacement = `    await conn.query(\`UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=$1\`, [req.params.id]);
    // Schema: payments has NO invoice_id column. entity_name is NOT NULL — look it up inside tx.
    const entNameR = await conn.query(
      inv.entity_type === 'client' ? 'SELECT company_name FROM clients WHERE id=$1' : 'SELECT company_name FROM suppliers WHERE id=$1',
      [inv.entity_id]
    );
    const entName = entNameR.rows[0]?.company_name || 'Unknown';
    const payR = await conn.query(
      \`INSERT INTO payments (entity_type, entity_id, entity_name, amount, currency, payment_method, reference, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8) RETURNING *\`,
      [inv.entity_type, inv.entity_id, entName, parseFloat(inv.grand_total),
       'EUR', payment_method || 'bank_transfer', reference || '',
       \`Pays invoice \${inv.invoice_number || inv.id}\`]
    );`;
if (!src.includes(anchor)) { console.error('ERROR: anchor not found'); process.exit(1); }
src = src.replace(anchor, replacement);
fs.writeFileSync(path, src);
console.log('OK: mark-paid block repaired at', path);
