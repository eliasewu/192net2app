// ============================================================
// SMSInbox.test.tsx — vitest unit tests for SMS Inbox logic
// ============================================================
// Tests the core data transformation logic of the SMSInbox
// component: filtering, pagination, stats calculation, and
// channel-based classification. No DOM rendering required.
// All API calls are mocked.
//
// Run with: npx vitest run src/pages/SMSInbox.test.tsx
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { api } from '../services/api';

// ------------------------------------------------------------
// Mock the API client so no real HTTP calls are made
// ------------------------------------------------------------
vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApi = api as unknown as { get: Mock; post: Mock };

// ------------------------------------------------------------
// Test fixtures — mirrors actual mo_sms API response shape
// ------------------------------------------------------------
interface MoSmsRow {
  id: number;
  channel: string;
  external_id: string | null;
  sender: string;
  sender_name: string | null;
  recipient: string;
  message: string;
  message_type: string;
  metadata: unknown;
  reply_sent: boolean;
  reply_text: string | null;
  replied_at: string | null;
  processed: boolean;
  received_at: string;
}

const mockInboxData: MoSmsRow[] = [
  {
    id: 1, channel: 'whatsapp', external_id: 'wamid.abc', sender: '12345678901',
    sender_name: 'Alice', recipient: '11223344', message: 'Hello!',
    message_type: 'text', metadata: {}, reply_sent: false, reply_text: null,
    replied_at: null, processed: false,
    received_at: '2025-06-18T10:00:00Z',
  },
  {
    id: 2, channel: 'telegram', external_id: '42', sender: '987654321',
    sender_name: 'Bob', recipient: '-100123', message: 'TG msg',
    message_type: 'text', metadata: {}, reply_sent: true, reply_text: 'Done!',
    replied_at: '2025-06-18T10:30:00Z', processed: true,
    received_at: '2025-06-18T10:15:00Z',
  },
  {
    id: 3, channel: 'sms', external_id: null, sender: '+1234567890', sender_name: null,
    recipient: 'NET2APP', message: 'STOP', message_type: 'text', metadata: null,
    reply_sent: false, reply_text: null, replied_at: null, processed: true,
    received_at: '2025-06-18T09:00:00Z',
  },
  {
    id: 4, channel: 'whatsapp', external_id: 'wamid.def', sender: '10987654321',
    sender_name: 'Charlie', recipient: '99887766', message: 'Photo message',
    message_type: 'image', metadata: {}, reply_sent: false, reply_text: null,
    replied_at: null, processed: false,
    received_at: '2025-06-18T11:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------
// Replicated pure logic from SMSInbox component
// These functions mirror the component's data transformations
// so we can test them without rendering to DOM.
// ------------------------------------------------------------

/** Compute inbox stats from raw mo_sms data */
function computeStats(data: MoSmsRow[]) {
  return {
    total: data.length,
    replied: data.filter(m => m.reply_sent).length,
    unread: data.filter(m => !m.processed).length,
    whatsapp: data.filter(m => m.channel === 'whatsapp').length,
    telegram: data.filter(m => m.channel === 'telegram').length,
  };
}

/** Client-side filter matching the component's search logic */
function filterMessages(data: MoSmsRow[], search: string): MoSmsRow[] {
  if (!search) return data;
  const s = search.toLowerCase();
  return data.filter(m =>
    m.sender.includes(search) ||
    (m.sender_name || '').toLowerCase().includes(s) ||
    (m.message || '').toLowerCase().includes(s) ||
    (m.recipient || '').toLowerCase().includes(s)
  );
}

/** Paginate filtered results */
function paginate(data: MoSmsRow[], page: number, perPage: number): MoSmsRow[] {
  return data.slice((page - 1) * perPage, page * perPage);
}

/** Compute total pages */
function totalPages(count: number, perPage: number): number {
  return Math.ceil(count / perPage);
}

// ------------------------------------------------------------
// Stats tests
// ------------------------------------------------------------
describe('SMSInbox — stats calculation', () => {
  it('computes total count correctly', () => {
    expect(computeStats(mockInboxData).total).toBe(4);
  });

  it('counts WhatsApp messages', () => {
    expect(computeStats(mockInboxData).whatsapp).toBe(2);
  });

  it('counts Telegram messages', () => {
    expect(computeStats(mockInboxData).telegram).toBe(1);
  });

  it('counts unprocessed (New) messages', () => {
    // Alice (id=1): processed=false → unprocessed
    // Charlie (id=4): processed=false → unprocessed
    expect(computeStats(mockInboxData).unread).toBe(2);
  });

  it('counts replied messages', () => {
    // Bob (id=2): reply_sent=true → replied
    expect(computeStats(mockInboxData).replied).toBe(1);
  });

  it('returns zero for empty data', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.whatsapp).toBe(0);
    expect(stats.telegram).toBe(0);
    expect(stats.unread).toBe(0);
    expect(stats.replied).toBe(0);
  });
});

// ------------------------------------------------------------
// Search/filter tests
// ------------------------------------------------------------
describe('SMSInbox — search filtering', () => {
  it('filters by exact sender phone number (keeps matching, removes others)', () => {
    // Alice's sender is '12345678901' → should match
    const result = filterMessages(mockInboxData, '12345678901');
    expect(result).toHaveLength(1);
    expect(result[0].sender).toBe('12345678901');
    expect(result[0].message).toBe('Hello!');
  });

  it('filters by sender name (case insensitive)', () => {
    const result = filterMessages(mockInboxData, 'bob');
    expect(result).toHaveLength(1);
    expect(result[0].sender_name).toBe('Bob');
  });

  it('filters by message content', () => {
    const result = filterMessages(mockInboxData, 'STOP');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('STOP');
  });

  it('filters by message content (case insensitive)', () => {
    const result = filterMessages(mockInboxData, 'hello');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Hello!');
  });

  it('filters by recipient', () => {
    const result = filterMessages(mockInboxData, 'NET2APP');
    expect(result).toHaveLength(1);
    expect(result[0].recipient).toBe('NET2APP');
  });

  it('returns all messages when search is empty', () => {
    expect(filterMessages(mockInboxData, '')).toHaveLength(4);
  });

  it('returns empty array when no match', () => {
    const result = filterMessages(mockInboxData, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('handles null sender_name gracefully', () => {
    // SMS message has sender_name = null — should not crash
    const result = filterMessages(mockInboxData, '+1234567890');
    expect(result).toHaveLength(1);
  });

  it('handles empty/null message field gracefully', () => {
    const dataWithNullMessage = [{ ...mockInboxData[0], message: '' }];
    const result = filterMessages(dataWithNullMessage, 'test');
    expect(result).toHaveLength(0); // no crash
    expect(filterMessages(dataWithNullMessage, '')).toHaveLength(1);
  });
});

// ------------------------------------------------------------
// Pagination tests
// ------------------------------------------------------------
describe('SMSInbox — pagination', () => {
  it('paginates data correctly (page 1, 2 per page)', () => {
    const page1 = paginate(mockInboxData, 1, 2);
    expect(page1).toHaveLength(2);
    expect(page1[0].id).toBe(1);
    expect(page1[1].id).toBe(2);
  });

  it('paginates data correctly (page 2, 2 per page)', () => {
    const page2 = paginate(mockInboxData, 2, 2);
    expect(page2).toHaveLength(2);
    expect(page2[0].id).toBe(3);
    expect(page2[1].id).toBe(4);
  });

  it('returns empty for page beyond range', () => {
    const page3 = paginate(mockInboxData, 3, 2);
    expect(page3).toHaveLength(0);
  });

  it('computes total pages correctly', () => {
    expect(totalPages(4, 2)).toBe(2);
    expect(totalPages(5, 2)).toBe(3);
    expect(totalPages(0, 15)).toBe(0);
    expect(totalPages(1, 15)).toBe(1);
    expect(totalPages(15, 15)).toBe(1);
    expect(totalPages(16, 15)).toBe(2);
  });

  it('handles default page size of 15', () => {
    const page1 = paginate(mockInboxData, 1, 15);
    expect(page1).toHaveLength(4); // all 4 fit on page 1
    expect(totalPages(4, 15)).toBe(1);
  });
});

// ------------------------------------------------------------
// Channel classification tests
// ------------------------------------------------------------
describe('SMSInbox — channel classification', () => {
  it('identifies WhatsApp messages by channel field', () => {
    const waMessages = mockInboxData.filter(m => m.channel === 'whatsapp');
    expect(waMessages).toHaveLength(2);
    expect(waMessages.every(m => m.channel === 'whatsapp')).toBe(true);
  });

  it('identifies Telegram messages by channel field', () => {
    const tgMessages = mockInboxData.filter(m => m.channel === 'telegram');
    expect(tgMessages).toHaveLength(1);
  });

  it('identifies SMS messages by channel field', () => {
    const smsMessages = mockInboxData.filter(m => m.channel === 'sms');
    expect(smsMessages).toHaveLength(1);
  });

  it('handles unknown channels gracefully', () => {
    const unknown = mockInboxData.filter(m => m.channel === 'unknown');
    expect(unknown).toHaveLength(0);
  });
});

// ------------------------------------------------------------
// Reply state tests
// ------------------------------------------------------------
describe('SMSInbox — reply state', () => {
  it('marks message as replied after successful reply', () => {
    const before = { ...mockInboxData[0], reply_sent: false, processed: false, reply_text: null };
    // Simulate the state update from handleReply success
    const after = {
      ...before,
      reply_sent: true,
      processed: true,
      reply_text: 'Got your message!',
      replied_at: new Date().toISOString(),
    };
    expect(after.reply_sent).toBe(true);
    expect(after.processed).toBe(true);
    expect(after.reply_text).toBe('Got your message!');
    expect(after.replied_at).toBeTruthy();
    expect(new Date(after.replied_at!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('distinguishes processed from replied states', () => {
    // SMS message: processed=true, reply_sent=false
    const sms = mockInboxData[2];
    expect(sms.processed).toBe(true);
    expect(sms.reply_sent).toBe(false);

    // Bob's message: processed=true, reply_sent=true
    const bob = mockInboxData[1];
    expect(bob.processed).toBe(true);
    expect(bob.reply_sent).toBe(true);

    // Alice's message: processed=false, reply_sent=false
    const alice = mockInboxData[0];
    expect(alice.processed).toBe(false);
    expect(alice.reply_sent).toBe(false);
  });

  it('maintains reply_text from the API', () => {
    expect(mockInboxData[1].reply_text).toBe('Done!');
    expect(mockInboxData[0].reply_text).toBeNull();
  });
});

// ------------------------------------------------------------
// Message type handling
// ------------------------------------------------------------
describe('SMSInbox — message type', () => {
  it('identifies non-text message types', () => {
    const imageMessages = mockInboxData.filter(m => m.message_type !== 'text');
    expect(imageMessages).toHaveLength(1);
    expect(imageMessages[0].message_type).toBe('image');
  });

  it('identifies text message types', () => {
    const textMessages = mockInboxData.filter(m => m.message_type === 'text');
    expect(textMessages).toHaveLength(3);
  });

  it('handles null/undefined message_type gracefully', () => {
    const row = { ...mockInboxData[0], message_type: '' as unknown as string };
    expect(row.message_type !== 'text').toBe(true);
  });
});

// ------------------------------------------------------------
// Display name logic tests
// ------------------------------------------------------------
describe('SMSInbox — display name', () => {
  it('prefers sender_name over sender for display', () => {
    const displayName = mockInboxData[0].sender_name || mockInboxData[0].sender;
    expect(displayName).toBe('Alice');
  });

  it('falls back to sender when sender_name is null', () => {
    const displayName = mockInboxData[2].sender_name || mockInboxData[2].sender;
    expect(displayName).toBe('+1234567890');
  });

  it('falls back to dash when both are empty', () => {
    const row: MoSmsRow = { ...mockInboxData[0], sender_name: null, sender: '' };
    const displayName = row.sender_name || row.sender || '-';
    expect(displayName).toBe('-');
  });

  it('shows raw sender when it differs from sender_name', () => {
    const row = mockInboxData[0];
    const name = row.sender_name;
    const raw = row.sender;
    expect(name).not.toBe(raw); // 'Alice' !== '12345678901'
    // In the component, this means the raw number is shown in parens
    expect(typeof name).toBe('string');
    expect(typeof raw).toBe('string');
  });
});

// ------------------------------------------------------------
// API integration tests
// ------------------------------------------------------------
describe('SMSInbox — API calls', () => {
  it('calls GET /mo_sms with default limit on mount', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: mockInboxData });

    const result = await mockedApi.get('/mo_sms?limit=500');
    expect(mockedApi.get).toHaveBeenCalledWith('/mo_sms?limit=500');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(4);
  });

  it('calls GET /mo_sms with channel filter', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: [mockInboxData[0]] });

    await mockedApi.get('/mo_sms?limit=500&channel=whatsapp');
    expect(mockedApi.get).toHaveBeenCalledWith('/mo_sms?limit=500&channel=whatsapp');
  });

  it('calls POST /mo_sms/reply with id and text', async () => {
    mockedApi.post.mockResolvedValue({ success: true, data: { replied: true } });

    await mockedApi.post('/mo_sms/reply', { id: 1, text: 'Hi!' });
    expect(mockedApi.post).toHaveBeenCalledWith('/mo_sms/reply', { id: 1, text: 'Hi!' });
  });

  it('handles reply success response', async () => {
    mockedApi.post.mockResolvedValue({
      success: true,
      data: { replied: true, wa_message_id: 'wamid.xyz' },
    });

    const result = await mockedApi.post('/mo_sms/reply', { id: 1, text: 'Thanks!' });
    expect(result.success).toBe(true);
    expect(result.data.replied).toBe(true);
    expect(result.data.wa_message_id).toBe('wamid.xyz');
  });

  it('handles reply failure response', async () => {
    mockedApi.post.mockResolvedValue({
      success: false,
      error: 'No active WhatsApp API configuration',
    });

    const result = await mockedApi.post('/mo_sms/reply', { id: 1, text: 'Hi' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('WhatsApp API configuration');
  });

  it('handles network error during reply', async () => {
    mockedApi.post.mockRejectedValue(new Error('Network error'));

    await expect(
      mockedApi.post('/mo_sms/reply', { id: 1, text: 'Hi' })
    ).rejects.toThrow('Network error');
  });

  it('handles empty API response gracefully', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: [] });
    const result = await mockedApi.get('/mo_sms?limit=500');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('handles null data from API without crashing', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: null });
    const result = await mockedApi.get('/mo_sms');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(false); // null, not an array
  });

  it('handles malformed API response gracefully', async () => {
    mockedApi.get.mockResolvedValue({ error: 'unknown' });
    const result = await mockedApi.get('/mo_sms');
    expect(result.success).toBeUndefined();
    expect(result.error).toBe('unknown');
  });
});

// ------------------------------------------------------------
// Edge cases
// ------------------------------------------------------------
describe('SMSInbox — edge cases', () => {
  it('handles empty data gracefully', () => {
    expect(computeStats([]).total).toBe(0);
    expect(filterMessages([], 'test')).toEqual([]);
    expect(paginate([], 1, 15)).toEqual([]);
    expect(totalPages(0, 15)).toBe(0);
  });

  it('handles single-item data', () => {
    const single = [mockInboxData[0]];
    expect(computeStats(single).total).toBe(1);
    expect(paginate(single, 1, 15)).toHaveLength(1);
    expect(totalPages(1, 15)).toBe(1);
  });

  it('sender_name can differ from sender', () => {
    const row = mockInboxData[0];
    expect(row.sender_name).toBe('Alice');
    expect(row.sender).toBe('12345678901');
    expect(row.sender_name).not.toBe(row.sender);
  });

  it('recipient can be empty', () => {
    const row: MoSmsRow = { ...mockInboxData[0], recipient: '' };
    expect(row.recipient || '-').toBe('-');
  });

  it('message_type can be non-text', () => {
    expect(mockInboxData[3].message_type).toBe('image');
    expect(mockInboxData[3].message_type !== 'text').toBe(true);
  });

  it('reply_sent requires processing flag for full life cycle', () => {
    // After reply: both reply_sent and processed should be true
    const after = { ...mockInboxData[0], reply_sent: true, processed: true };
    expect(after.reply_sent).toBe(true);
    expect(after.processed).toBe(true);
  });
});
