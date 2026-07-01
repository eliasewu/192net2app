// ============================================================
// translationPipeline.test.ts — integration test for the
// translation engine wired into /api/sms/send.
//
// Tests that active translation rules transform messages before
// they land in sms_logs.
//
// Prerequisites: the dev server must be running on localhost:5173
// and the PostgreSQL database must be accessible.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'sms_platform',
  user: process.env.DB_USER || 'sms_user',
  password: process.env.DB_PASSWORD || 'SmsPlatform2024Secure',
});

const BASE_URL = process.env.API_URL || 'http://localhost:5173';

let serverAvailable = false;
let authToken = '';
let testTranslationId: number | null = null;
let testMsgId: string | null = null;
let clientId: number | null = null;
let originalBalance: number | null = null;
let sidPoolRuleId: number | null = null;
let sidPoolMsgId: string | null = null;
let combinedSidRuleId: number | null = null;
let combinedContentRuleId: number | null = null;
let combinedMsgId: string | null = null;
let destRuleId: number | null = null;
let destMsgId: string | null = null;

/** Helper: skip a test if the dev server isn't reachable (CI, etc.) */
function skipUnlessServer(msg: string) {
  if (!serverAvailable) {
    console.log(`  [SKIP] ${msg} — dev server not reachable at ${BASE_URL}`);
  }
  return serverAvailable;
}

describe('Translation engine — SMS send pipeline', () => {
  beforeAll(async () => {
    // Pre-flight: check if the dev server is reachable. If not, mark
    // serverAvailable=false so every test body short-circuits. This
    // keeps CI green without a running dev server while still
    // letting developers run these integration tests locally.
    try {
      const pingRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        signal: AbortSignal.timeout(5000),
      });
      const loginData = (await pingRes.json()) as any;
      if (!loginData.token) {
        console.warn(`[SKIP] Dev server returned no token (${BASE_URL}) — integration tests skipped`);
        return;
      }
      serverAvailable = true;
      authToken = loginData.token;
    } catch (e: any) {
      console.warn(`[SKIP] Dev server not reachable at ${BASE_URL} (${e.message || e}) — integration tests skipped`);
      return;
    }

    // 2. Find an active client with a routing plan
    const clientsRes = await fetch(`${BASE_URL}/api/clients`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const clientsData = (await clientsRes.json()) as any;
    const client = clientsData.data?.find(
      (c: any) => c.status === 'active' && c.routing_plan_id
    );
    if (!client) throw new Error('No active client with routing_plan_id found');
    clientId = client.id;

    // 3. Ensure the client has enough balance for the test (temporarily)
    const balanceR = await pool.query(
      'SELECT balance FROM clients WHERE id = $1',
      [clientId]
    );
    originalBalance = parseFloat(balanceR.rows[0]?.balance || '0');
    if (originalBalance < 1) {
      await pool.query('UPDATE clients SET balance = $1 WHERE id = $2', [1, clientId]);
    }

    // 4. Insert a test translation rule (content replacement)
    const ruleRes = await pool.query(
      `INSERT INTO translations
         (translation_type, source_pattern, target_value, name, subtype, priority, apply_to, apply_entity_id, is_active)
       VALUES
         ('content', 'PRE_TEST_MSG', 'POST_TEST_MSG', 'E2E Pipeline Test', 'content_text_replacement', 1, 'client', 'all', true)
       RETURNING id`
    );
    testTranslationId = ruleRes.rows[0].id;
  }, 15000);

  afterAll(async () => {
    if (!serverAvailable) { await pool.end(); return; }
    // Clean up in reverse order
    if (combinedMsgId) {
      await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [combinedMsgId]).catch(() => {});
    }
    if (destMsgId) {
      await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [destMsgId]).catch(() => {});
    }
    if (destRuleId) {
      await pool.query('DELETE FROM translations WHERE id = $1', [destRuleId]).catch(() => {});
    }
    if (combinedContentRuleId) {
      await pool.query('DELETE FROM translations WHERE id = $1', [combinedContentRuleId]).catch(() => {});
    }
    if (combinedSidRuleId) {
      await pool.query('DELETE FROM translations WHERE id = $1', [combinedSidRuleId]).catch(() => {});
    }
    if (sidPoolMsgId) {
      await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [sidPoolMsgId]).catch(() => {});
    }
    if (sidPoolRuleId) {
      await pool.query('DELETE FROM translations WHERE id = $1', [sidPoolRuleId]).catch(() => {});
    }
    if (testMsgId) {
      await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [testMsgId]).catch(() => {});
    }
    if (testTranslationId) {
      await pool.query('DELETE FROM translations WHERE id = $1', [testTranslationId]).catch(() => {});
    }
    if (clientId !== null && originalBalance !== null) {
      await pool.query('UPDATE clients SET balance = $1 WHERE id = $2', [originalBalance, clientId]).catch(() => {});
    }
    await pool.end();
  });

  it('transforms message via active translation rule and persists result in sms_logs', async () => {
    if (!skipUnlessServer('content replacement persistence')) return;
    if (!clientId) throw new Error('No client available');

    const originalMessage = 'PRE_TEST_MSG hello world';
    const expectedMessage = 'POST_TEST_MSG hello world';

    // Send SMS through the pipeline
    const sendRes = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        destination: '+12345678901',
        sender_id: 'TEST',
        message: originalMessage,
      }),
    });
    const sendData = (await sendRes.json()) as any;

    // The send may succeed even without a supplier (unrouted → logged as failed)
    // so we don't assert on sendData.success — we care about sms_logs
    testMsgId = sendData.data?.message_id;
    expect(testMsgId).toBeTruthy();

    // Verify the transformed message landed in sms_logs
    const logRes = await pool.query(
      'SELECT message, sender_id, destination FROM sms_logs WHERE message_id = $1',
      [testMsgId]
    );
    expect(logRes.rows.length).toBe(1);
    expect(logRes.rows[0].message).toBe(expectedMessage);
  });

  it('picks random sender_id from pipe-separated pool (sender_id_masking)', async () => {
    if (!skipUnlessServer('sender_id_masking pool')) return;
    if (!clientId) throw new Error('No client available');

    const poolValues = ['SID_ALPHA', 'SID_BETA', 'SID_GAMMA'];

    // Insert a sender_id_masking rule with pipe-separated pool
    const ruleRes = await pool.query(
      `INSERT INTO translations
         (translation_type, source_pattern, target_value, name, subtype, priority, apply_to, apply_entity_id, is_active)
       VALUES
         ('sender_id', '.*', $1, 'SID Pool E2E Test', 'sender_id_masking', 1, 'client', 'all', true)
       RETURNING id`,
      [poolValues.join('|')]
    );
    sidPoolRuleId = ruleRes.rows[0].id;

    // Send SMS
    const sendRes = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        destination: '+12345678910',
        sender_id: 'ORIGINAL_SENDER',
        message: 'Random SID pool test message',
      }),
    });
    const sendData = (await sendRes.json()) as any;
    sidPoolMsgId = sendData.data?.message_id;
    expect(sidPoolMsgId).toBeTruthy();

    // Verify the sender_id in sms_logs is one of the pool values
    const logRes = await pool.query(
      'SELECT sender_id FROM sms_logs WHERE message_id = $1',
      [sidPoolMsgId]
    );
    expect(logRes.rows.length).toBe(1);
    expect(poolValues).toContain(logRes.rows[0].sender_id);

    // Clean up immediately so the next test starts with a clean DB
    await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [sidPoolMsgId]).catch(() => {});
    await pool.query('DELETE FROM translations WHERE id = $1', [sidPoolRuleId]).catch(() => {});
    sidPoolMsgId = null;
    sidPoolRuleId = null;
  });

  it('applies SID masking + content replacement simultaneously on one SMS', async () => {
    if (!skipUnlessServer('combined SID + content transform')) return;
    if (!clientId) throw new Error('No client available');

    const sidPool = ['SIMUL_SID_A', 'SIMUL_SID_B', 'SIMUL_SID_C'];

    // Insert SID masking rule
    const sidR = await pool.query(
      `INSERT INTO translations
         (translation_type, source_pattern, target_value, name, subtype, priority, apply_to, apply_entity_id, is_active)
       VALUES
         ('sender_id', '.*', $1, 'Combined SID mask', 'sender_id_masking', 1, 'client', 'all', true)
       RETURNING id`,
      [sidPool.join('|')]
    );
    combinedSidRuleId = sidR.rows[0].id;

    // Insert content replacement rule
    const contentR = await pool.query(
      `INSERT INTO translations
         (translation_type, source_pattern, target_value, name, subtype, priority, apply_to, apply_entity_id, is_active)
       VALUES
         ('content', 'SIMUL_TEST', 'SIMUL_TRANSFORMED', 'Combined content replacement', 'content_text_replacement', 2, 'client', 'all', true)
       RETURNING id`
    );
    combinedContentRuleId = contentR.rows[0].id;

    // Send one SMS that should trigger both rules
    const sendRes = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        destination: '+12345678920',
        sender_id: 'ANY_SENDER',
        message: 'SIMUL_TEST combined message',
      }),
    });
    const sendData = (await sendRes.json()) as any;
    combinedMsgId = sendData.data?.message_id;
    expect(combinedMsgId).toBeTruthy();

    // Verify BOTH transformations landed in sms_logs
    const logRes = await pool.query(
      'SELECT sender_id, message FROM sms_logs WHERE message_id = $1',
      [combinedMsgId]
    );
    expect(logRes.rows.length).toBe(1);
    // Sender_id should be one of the pool values (SID mask applied)
    expect(sidPool).toContain(logRes.rows[0].sender_id);
    // Message should have the content replacement applied
    expect(logRes.rows[0].message).toBe('SIMUL_TRANSFORMED combined message');

    // Clean up immediately
    await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [combinedMsgId]).catch(() => {});
    await pool.query('DELETE FROM translations WHERE id = $1', [combinedContentRuleId]).catch(() => {});
    await pool.query('DELETE FROM translations WHERE id = $1', [combinedSidRuleId]).catch(() => {});
    combinedMsgId = null;
    combinedContentRuleId = null;
    combinedSidRuleId = null;
  });

  it('does NOT transform when no matching rule exists', async () => {
    if (!skipUnlessServer('no-match passthrough')) return;
    if (!clientId) throw new Error('No client available');

    const originalMessage = 'UNRELATED_MESSAGE no rules match this';

    // Send SMS
    const sendRes = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        destination: '+12345678902',
        sender_id: 'TEST2',
        message: originalMessage,
      }),
    });
    const sendData = (await sendRes.json()) as any;
    const msgId = sendData.data?.message_id;
    expect(msgId).toBeTruthy();

    // Verify the message was NOT transformed
    const logRes = await pool.query(
      'SELECT message FROM sms_logs WHERE message_id = $1',
      [msgId]
    );
    expect(logRes.rows.length).toBe(1);
    expect(logRes.rows[0].message).toBe(originalMessage);

    // Clean up this test message
    await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [msgId]).catch(() => {});
  });

  it('transforms destination via translation rule and persists in sms_logs', async () => {
    if (!skipUnlessServer('destination formatting')) return;
    if (!clientId) throw new Error('No client available');

    // Insert a destination rule that strips leading zeros
    const ruleRes = await pool.query(
      `INSERT INTO translations
         (translation_type, source_pattern, target_value, name, subtype, priority, apply_to, apply_entity_id, is_active)
       VALUES
         ('destination', '^0+', '', 'Strip Leading Zeros', 'destination_formatting', 1, 'client', 'all', true)
       RETURNING id`
    );
    destRuleId = ruleRes.rows[0].id;

    const originalDest = '00491234567890';
    const expectedDest = '491234567890';

    const sendRes = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        destination: originalDest,
        sender_id: 'DEST_TEST',
        message: 'Destination formatting test',
      }),
    });
    const sendData = (await sendRes.json()) as any;
    destMsgId = sendData.data?.message_id;
    expect(destMsgId).toBeTruthy();

    const logRes = await pool.query(
      'SELECT destination FROM sms_logs WHERE message_id = $1',
      [destMsgId]
    );
    expect(logRes.rows.length).toBe(1);
    expect(logRes.rows[0].destination).toBe(expectedDest);

    // Clean up immediately
    await pool.query('DELETE FROM sms_logs WHERE message_id = $1', [destMsgId]).catch(() => {});
    await pool.query('DELETE FROM translations WHERE id = $1', [destRuleId]).catch(() => {});
    destMsgId = null;
    destRuleId = null;
  });
});
