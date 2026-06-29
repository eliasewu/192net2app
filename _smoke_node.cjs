// Native-Node smoke test for apiExtensions.cjs — no bash eval quoting issues.
// Starts the actual server.cjs in-process via child_process, waits, runs
// the test matrix, then kills cleanly.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3001; // avoid colliding with a dev server on 3000
const BASE = `http://localhost:${PORT}`;

function startServer() {
  const child = spawn('node', ['server.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', d => { bootLog += d.toString(); });
  child.stderr.on('data', d => { bootLog += d.toString(); });
  return { child, getBootLog: () => bootLog };
}

async function waitReady(maxMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        signal: AbortSignal.timeout(1000),
      });
      if (r.status > 0) return true;
    } catch {}
  }
  return false;
}

async function login() {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json();
  return { status: r.status, token: j.token, body: j };
}

async function probe(method, ep, token, body) {
  const init = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(8000),
  };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  try {
    const r = await fetch(BASE + ep, init);
    const text = await r.text();
    return { status: r.status, body: text.substring(0, 200) };
  } catch (e) {
    return { status: 'ERR', body: e.message };
  }
}

(async () => {
  const { child, getBootLog } = startServer();
  console.log('=== waiting for server ===');
  const ok = await waitReady();
  if (!ok) {
    console.log('server did not become ready in 8s');
    console.log('--- BOOT LOG ---');
    console.log(getBootLog());
    child.kill('SIGKILL');
    process.exit(1);
  }
  console.log('--- BOOT LOG (first 20 lines) ---');
  console.log(getBootLog().split('\n').slice(0, 20).join('\n'));
  console.log('');

  const lg = await login();
  console.log('=== login ===', 'HTTP', lg.status, 'token-prefix:', (lg.token || '').substring(0, 30));
  const T = lg.token;

  const tests = [
    ['POST', '/api/sms/validate', '{"client_id":1,"destination":"+13105551234","message":"hi"}'],
    ['POST', '/api/sms/dlr/batch', '{"message_ids":["MSG123","MSG999"]}'],
    ['GET',  '/api/rates/history?entity_type=client&entity_id=1', null],
    ['POST', '/api/rates/deactivate-old', '{"rates":[{"entity_type":"client","entity_id":1,"mcc":"310","mnc":"260"}]}'],
    ['GET',  '/api/rates/destination?entity_type=client&entity_id=1&mcc=310', null],
    ['POST', '/api/invoices/generate', '{"entity_type":"client","entity_id":1,"period_start":"2024-01-01","period_end":"2024-01-31"}'],
    ['GET',  '/api/invoices/1', null],
    ['GET',  '/api/invoices/1/breakdown', null],
    ['POST', '/api/payments', '{"entity_type":"client","entity_id":1,"amount":1.5,"currency":"EUR","payment_method":"wire","reference":"R1"}'],
    ['GET',  '/api/payments/history?entity_type=client&entity_id=1', null],
    ['POST', '/api/payments/list', '{}'],
    ['POST', '/api/voice-otp/send', '{"destination":"+12345678900","otp_code":"1234","language":"en-US"}'],
    ['GET',  '/api/voice-otp/languages', null],
    ['POST', '/api/translations', '{"translation_type":"sender_id","source_pattern":"^OLD","target_value":"NEW"}'],
    ['POST', '/api/translations/list', '{}'],
    ['POST', '/api/notifications/list', '{}'],
    ['POST', '/api/notifications/low-balance', '{"entity_type":"client","entity_id":1,"balance":5,"threshold":50}'],
    ['PUT',  '/api/billing/mode', '{"entity_type":"client","entity_id":1,"billing_mode":"dlr"}'],
    ['GET',  '/api/bind/1/history', null],
    ['GET',  '/api/api-connectors', null],
    ['POST', '/api/api-connectors', '{"name":"smoke-conn","send_url":"http://example.com","http_method":"POST","auth_type":"NONE","is_active":true}'],
  ];

  console.log('=== probes ===');
  for (const [m, ep, bd] of tests) {
    const r = await probe(m, ep, T, bd);
    console.log(`  ${m.padEnd(5)} ${ep.padEnd(60)} HTTP ${r.status}  ${r.body.replace(/\n/g, ' ').substring(0, 140)}`);
  }

  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 500));
  try { child.kill('SIGKILL'); } catch {}
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
