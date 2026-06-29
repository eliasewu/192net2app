// Strip all TypeScript-style `: any` and `: number`/`: string`/`: boolean`
// parameter annotations from apiExtensions.cjs so plain Node can parse it.
const fs = require('fs');
const p = '/home/ubuntu/net2app-v3/apiExtensions.cjs';
let s = fs.readFileSync(p, 'utf8');
const before = s.length;

// Catch (e: any) and similar patterns: identifier followed by `:` then a TS type
// We allow a permissive type token: any|number|string|boolean|null|undefined|Error|object|never|unknown
s = s.replace(/\(([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(any|number|string|boolean|null|undefined|Error|object|never|unknown|Array<[^>]*>|Record<[^>]*>)\)/g, '($1)');
// Also catch multiple-arg patterns: (a, b: any)
s = s.replace(/,(\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(any|number|string|boolean|null|undefined|Error|object|never|unknown)\)/g, ',$1$2)');

// Specifically catch the param names from the patch: (e: any) etc. — explicit safety nets
const fixers = ['e: any','r: any','req: any','b: any','c: any','inv: any','conn: any','c2: any','rows: any','t: any','p: any','i: any','x: any','log: any'];
for (const f of fixers) {
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  s = s.replace(re, f.split(':')[0]);
}

fs.writeFileSync(p, s);
console.log('Stripped TS annotations. File length:', s.length, 'delta:', s.length - before);
