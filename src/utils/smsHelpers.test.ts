// ============================================================
// smsHelpers.test.ts — vitest tests for SMS delivery-receipt helpers
// ============================================================
// Run with: npx vitest run
// (Previously also ran standalone via: npx tsx src/utils/smsHelpers.test.ts
//  — that path is no longer supported. Use vitest.)
import { describe, it, expect } from 'vitest';
import { getDLRResponseTime, getDLRDuration, formatDuration, getRowStyle } from './smsHelpers';
import { SMSLog } from '../types';

// Default log fixture — every test calls makeLog({ ...overrides }) to
// construct an SMSLog shape with specific timing / status fields.
function makeLog(overrides: Partial<SMSLog> = {}): SMSLog {
  const now = new Date('2024-06-15T12:00:00Z');
  return {
    id: '1', message_id: 'MSG0000000001', client_id: '1', client_code: 'CLT001',
    supplier_id: null, supplier_code: null, sender_id: 'NET2APP', destination: '1234567890',
    mcc: '310', mnc: '410', country: 'United States', operator: 'AT&T',
    message: 'Test message', message_parts: 1, client_rate: 0.01, supplier_rate: 0.005,
    profit: 0.005, currency: 'EUR', status: 'delivered', dlr_status: 'DELIVRD',
    dlr_timestamp: new Date(now.getTime() + 2000).toISOString(),
    dlr_result: 'DELIVRD', dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null, route_name: null, trunk_name: null,
    submit_time: now.toISOString(),
    delivery_time: new Date(now.getTime() + 2500).toISOString(),
    created_at: now.toISOString(),
    ...overrides,
  };
}

// ============================================================
// getDLRResponseTime
// ============================================================
describe('getDLRResponseTime', () => {
  it('returns time difference in ms (2.5s)', () => {
    expect(
      getDLRResponseTime(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        dlr_timestamp: '2024-06-15T12:00:02.500Z',
      }))
    ).toBe(2500);
  });

  it('returns null for null dlr_timestamp', () => {
    expect(getDLRResponseTime(makeLog({ dlr_timestamp: null }))).toBeNull();
  });

  it('returns null for empty submit_time', () => {
    expect(getDLRResponseTime(makeLog({ submit_time: '' }))).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(
      getDLRResponseTime(makeLog({
        submit_time: 'not-a-date',
        dlr_timestamp: '2024-06-15T12:00:02.000Z',
      }))
    ).toBeNull();
  });

  it('returns 0 for identical timestamps', () => {
    expect(
      getDLRResponseTime(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        dlr_timestamp: '2024-06-15T12:00:00.000Z',
      }))
    ).toBe(0);
  });

  it('handles large time differences (2 hours = 7,200,000ms)', () => {
    expect(
      getDLRResponseTime(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        dlr_timestamp: '2024-06-15T14:00:00.000Z',
      }))
    ).toBe(7200000);
  });
});

// ============================================================
// getDLRDuration
// ============================================================
describe('getDLRDuration', () => {
  it('returns time difference between submit and delivery (3.2s)', () => {
    expect(
      getDLRDuration(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        delivery_time: '2024-06-15T12:00:03.200Z',
      }))
    ).toBe(3200);
  });

  it('returns null for null delivery_time', () => {
    expect(getDLRDuration(makeLog({ delivery_time: null }))).toBeNull();
  });

  it('returns null for empty submit_time', () => {
    expect(getDLRDuration(makeLog({ submit_time: '' }))).toBeNull();
  });

  it('returns null for invalid delivery date', () => {
    expect(
      getDLRDuration(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        delivery_time: 'garbage',
      }))
    ).toBeNull();
  });

  it('handles instant delivery (0ms)', () => {
    expect(
      getDLRDuration(makeLog({
        submit_time: '2024-06-15T12:00:00.000Z',
        delivery_time: '2024-06-15T12:00:00.000Z',
      }))
    ).toBe(0);
  });
});

// ============================================================
// formatDuration
// ============================================================
describe('formatDuration', () => {
  it('returns "-" for null', () => {
    expect(formatDuration(null)).toBe('-');
  });

  it('returns "-" for negative values', () => {
    expect(formatDuration(-500)).toBe('-');
  });

  it('returns "0ms" for 0', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats 500ms', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats 999ms (boundary)', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats 1000ms as 1.0s (boundary)', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('formats 2500ms as 2.5s', () => {
    expect(formatDuration(2500)).toBe('2.5s');
  });

  it('formats 59999ms as 60.0s', () => {
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats 60000ms as 1.0m (boundary)', () => {
    expect(formatDuration(60000)).toBe('1.0m');
  });

  it('formats 90000ms as 1.5m', () => {
    expect(formatDuration(90000)).toBe('1.5m');
  });

  it('formats 1 hour as 60.0m', () => {
    expect(formatDuration(3600000)).toBe('60.0m');
  });
});

// ============================================================
// getRowStyle — DLR-aware Tailwind row classnames
// Priority: DELIVRD > failed/UNDELIV/rejected > pending > sent > default
// ============================================================
describe('getRowStyle', () => {
  it('green for delivered status', () => {
    expect(
      getRowStyle(makeLog({ status: 'delivered', dlr_status: null }))
    ).toBe('bg-green-50 hover:bg-green-100');
  });

  it('green for DELIVRD dlr_status regardless of status', () => {
    expect(
      getRowStyle(makeLog({ status: 'sent', dlr_status: 'DELIVRD' }))
    ).toBe('bg-green-50 hover:bg-green-100');
  });

  it('red for failed status', () => {
    expect(
      getRowStyle(makeLog({ status: 'failed', dlr_status: null }))
    ).toBe('bg-red-50 hover:bg-red-100');
  });

  it('red for UNDELIV dlr_status', () => {
    expect(
      getRowStyle(makeLog({ status: 'sent', dlr_status: 'UNDELIV' }))
    ).toBe('bg-red-50 hover:bg-red-100');
  });

  it('red for rejected status', () => {
    expect(
      getRowStyle(makeLog({ status: 'rejected', dlr_status: null }))
    ).toBe('bg-red-50 hover:bg-red-100');
  });

  it('yellow for pending status', () => {
    expect(
      getRowStyle(makeLog({ status: 'pending', dlr_status: null }))
    ).toBe('bg-yellow-50 hover:bg-yellow-100');
  });

  it('blue for sent status', () => {
    expect(
      getRowStyle(makeLog({ status: 'sent', dlr_status: null }))
    ).toBe('bg-blue-50 hover:bg-blue-100');
  });

  it('empty string for expired status', () => {
    expect(
      getRowStyle(makeLog({ status: 'expired', dlr_status: null }))
    ).toBe('');
  });

  it('DELIVRD takes precedence over pending', () => {
    expect(
      getRowStyle(makeLog({ status: 'pending', dlr_status: 'DELIVRD' }))
    ).toBe('bg-green-50 hover:bg-green-100');
  });

  it('UNDELIV takes precedence over sent', () => {
    expect(
      getRowStyle(makeLog({ status: 'sent', dlr_status: 'UNDELIV' }))
    ).toBe('bg-red-50 hover:bg-red-100');
  });
});
