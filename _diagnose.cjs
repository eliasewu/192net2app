// Diagnostic: what routes does apiExtensions.cjs actually register when required?
const express = require('express');
const app = express();
const noop = (req,res,next)=>next();
const roles = (...r)=>noop;
// Mock pool (no DB queries — we never hit /api/foo, only list routes)
const pool = { query: () => Promise.resolve({ rows: [] }), connect: () => ({ query: () => Promise.resolve({ rows: [] }), release: () => {} }) };
try {
  require('./apiExtensions.cjs')(app, pool, noop, roles);
  console.log('=== require succeeded ===');
} catch (e) {
  console.log('=== require THREW ===');
  console.log(e.message);
  console.log(e.stack && e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
console.log('=== registered routes ===');
const seen = [];
function walk(stack, prefix='') {
  for (const layer of stack) {
    if (layer.route) {
      seen.push({ methods: Object.keys(layer.route.methods), path: prefix + (layer.route.path || '') });
    } else if (layer.name === 'router' && layer.handle.stack) {
      // sub-router, skip detail
    }
  }
}
walk(app._router.stack);
const byPrefix = {};
for (const r of seen) {
  const p = r.path.replace(/:\w+/g, ':P').replace(/\?\(/g, '(?');
  const key = p.split('/').slice(0, 3).join('/');
  byPrefix[key] = (byPrefix[key] || 0) + 1;
}
console.log('total handlers:', seen.length);
console.log('by first 3 path segments:');
for (const [k,n] of Object.entries(byPrefix).sort()) console.log('  ', k, '=', n);
// Dump all of them
for (const r of seen) console.log('  ', r.methods.join(','), r.path);
console.log('=== END ===');
