const fs = require('fs');
const path = '/home/ubuntu/net2app-v3/apiExtensions.cjs';
let src = fs.readFileSync(path, 'utf8');
// Old broken block: uses inv.grand_total (no parseFloat), mid-VALUES 'completed' literal, 8 placeholders
const oldBlockRe = /    const payR = await conn\.query\(\s*`INSERT INTO payments \(entity_type, entity_id, entity_name, amount, currency, payment_method, reference, status, notes\)\s+VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'completed',\$7,\$8\) RETURNING \*`,\s*\[inv\.entity_type, inv\.entity_id, inv\.grand_total, 'EUR', payment_method \|\| 'bank_transfer', reference \|\| '', req\.params\.id, 'Auto-created by mark-paid\.'\]\s*\);\s*/;
const before = src.length;
src = src.replace(oldBlockRe, '');
console.log(`Removed ${before - src.length} chars of duplicate broken payR block`);
fs.writeFileSync(path, src);
