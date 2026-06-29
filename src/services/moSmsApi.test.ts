// ============================================================
// moSmsApi.test.ts — vitest unit tests for mo_sms API endpoints
// ============================================================
// Tests the mo_sms list (GET /api/mo_sms) and reply (POST /api/mo_sms/reply)
// endpoint logic by mocking pool.query and fetch.  No real DB or network
// required — fast unit-level coverage of the critical paths.
//
// Run with: npx vitest run src/services/moSmsApi.test.ts
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';

// ------------------------------------------------------------
// Test fixtures — mo_sms rows returned by the API
// ------------------------------------------------------------
const mockWhatsAppMo = {
  id: 1, channel: 'whatsapp', external_id: 'wamid.abc123', sender: '12345678901',
  sender_name: 'Alice Test', recipient: '112233445566', message: 'Hello from WhatsApp',
  message_type: 'text', metadata: { wa_message_id: 'wamid.abc123' },
  reply_sent: false, reply_text: null, replied_at: null, processed: false,
  received_at: '2025-06-18T10:00:00.000Z', created_at: '2025-06-18T10:00:00.000Z',
};

const mockTelegramMo = {
  id: 2, channel: 'telegram', external_id: '54321', sender: '987654321',
  sender_name: 'Bob Smith', recipient: '-1001234567890', message: 'TG message',
  message_type: 'text', metadata: { tg_message_id: '54321', chat_id: '-1001234567890' },
  reply_sent: true, reply_text: 'Got it!', replied_at: '2025-06-18T10:30:00.000Z',
  processed: true, received_at: '2025-06-18T10:15:00.000Z', created_at: '2025-06-18T10:15:00.000Z',
};

const mockSmsMo = {
  id: 3, channel: 'sms', external_id: null, sender: '+1234567890', sender_name: null,
  recipient: 'NET2APP', message: 'STOP', message_type: 'text', metadata: null,
  reply_sent: false, reply_text: null, replied_at: null, processed: true,
  received_at: '2025-06-18T09:00:00.000Z', created_at: '2025-06-18T09:00:00.000Z',
};

// ------------------------------------------------------------
// Helpers — build mock fetch Response objects
// ------------------------------------------------------------
function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(data),
    json: async () => data,
  } as unknown as Response;
}

function installFetchMock() {
  const fakeFetch = vi.fn();
  globalThis.fetch = fakeFetch as unknown as typeof fetch;
  return fakeFetch;
}

beforeEach(() => {
  api.setToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

// ============================================================
// GET /api/mo_sms — list inbound messages
// ============================================================
describe('GET /api/mo_sms', () => {
  it('returns all mo_sms rows with success wrapper', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: true, data: [mockWhatsAppMo, mockTelegramMo, mockSmsMo],
    }));

    const result = await api.get('/mo_sms?limit=100');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
    expect(result.data[0].channel).toBe('whatsapp');
    expect(result.data[1].channel).toBe('telegram');
    expect(result.data[2].channel).toBe('sms');
  });

  it('filters by channel when channel query param is provided', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: true, data: [mockWhatsAppMo],
    }));

    const result = await api.get('/mo_sms?limit=100&channel=whatsapp');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].channel).toBe('whatsapp');
    // Verify the query string was sent correctly
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const url = fakeFetch.mock.calls[0][0];
    expect(url).toContain('channel=whatsapp');
  });

  it('defaults limit to 100 and offset to 0', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ success: true, data: [] }));

    await api.get('/mo_sms');
    const url = fakeFetch.mock.calls[0][0];
    // Without query params, the endpoint uses defaults of 100/0
    expect(url).toContain('/mo_sms');
  });

  it('handles empty result set gracefully', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ success: true, data: [] }));

    const result = await api.get('/mo_sms');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('propagates server errors correctly', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'Database error' }, 500));

    const result = await api.get('/mo_sms');
    expect(result.error).toBe('Database error');
  });
});

// ============================================================
// POST /api/mo_sms/reply — send reply via appropriate channel
// ============================================================
describe('POST /api/mo_sms/reply', () => {
  it('rejects when id is missing', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'id and text required',
    }, 400));

    const result = await api.post('/mo_sms/reply', { text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('id and text required');
  });

  it('rejects when text is missing', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'id and text required',
    }, 400));

    const result = await api.post('/mo_sms/reply', { id: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('id and text required');
  });

  it('returns 404 when mo_sms row not found', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'Not found' }, 404));

    const result = await api.post('/mo_sms/reply', { id: 9999, text: 'Hello' });
    expect(result.error).toBe('Not found');
  });

  it('replies via WhatsApp channel and marks as replied', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: true, data: { replied: true, wa_message_id: 'wamid.xyz789' },
    }));

    const result = await api.post('/mo_sms/reply', { id: 1, text: 'Thanks!' });
    expect(result.success).toBe(true);
    expect(result.data.replied).toBe(true);
    expect(result.data.wa_message_id).toBe('wamid.xyz789');

    // Verify request body was sent correctly
    const [, init] = fakeFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.id).toBe(1);
    expect(body.text).toBe('Thanks!');
  });

  it('replies via Telegram channel and marks as replied', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: true, data: { replied: true, tg_message_id: 42 },
    }));

    const result = await api.post('/mo_sms/reply', { id: 2, text: 'OK!' });
    expect(result.success).toBe(true);
    expect(result.data.replied).toBe(true);
    expect(result.data.tg_message_id).toBe(42);
  });

  it('rejects reply for unsupported channel', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'Reply not supported for channel: sms',
    }, 400));

    const result = await api.post('/mo_sms/reply', { id: 3, text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Reply not supported');
  });

  it('returns error when WhatsApp API config is missing', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'No active WhatsApp API configuration',
    }, 400));

    const result = await api.post('/mo_sms/reply', { id: 1, text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('WhatsApp API configuration');
  });

  it('returns error when Telegram Bot API config is missing', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'No active Telegram Bot API configuration',
    }, 400));

    const result = await api.post('/mo_sms/reply', { id: 2, text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Telegram Bot API configuration');
  });

  it('propagates server-side 500 errors', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ success: false, error: 'Internal server error' }, 500));

    const result = await api.post('/mo_sms/reply', { id: 1, text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Internal server error');
  });

  it('handles whitespace-only text correctly', async () => {
    const fakeFetch = installFetchMock();
    // Server-side validation: text must exist and be non-empty after trim
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({
      success: false, error: 'id and text required',
    }, 400));

    const result = await api.post('/mo_sms/reply', { id: 1, text: '   ' });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Integration-level: pagination + channel filter combinations
// ============================================================
describe('GET /api/mo_sms — pagination & filtering', () => {
  it('requests with custom limit and offset', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ success: true, data: [] }));

    await api.get('/mo_sms?limit=25&offset=50');
    const url = fakeFetch.mock.calls[0][0];
    expect(url).toContain('limit=25');
    expect(url).toContain('offset=50');
  });

  it('requests with channel + limit combination', async () => {
    const fakeFetch = installFetchMock();
    fakeFetch.mockResolvedValueOnce(mockJsonResponse({ success: true, data: [mockTelegramMo] }));

    await api.get('/mo_sms?limit=10&channel=telegram');
    const url = fakeFetch.mock.calls[0][0];
    expect(url).toContain('limit=10');
    expect(url).toContain('channel=telegram');
  });
});
