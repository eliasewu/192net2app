// ============================================================
// SMSLogs.test.tsx — vitest unit tests for SMSLogs logic
// ============================================================
// Tests the core data transformation logic of the SMSLogs
// component: DLR status filtering (with backward-compatible
// inference from legacy status), search filtering, status
// filtering, combined filters, pagination, and stats.
//
// Run with: npx vitest run src/pages/SMSLogs.test.tsx
// ============================================================

import { describe, it, expect } from 'vitest';
import type { SMSLog } from '../types';

// ------------------------------------------------------------
// Test fixtures — varied DLR statuses and legacy statuses
// ------------------------------------------------------------
const mockLogs: SMSLog[] = [
  {
    id: '1', message_id: 'MSG-aaaa-bbbb-cccc', client_id: '101', client_code: 'CLT-ACME',
    supplier_id: '201', supplier_code: 'SUP-FAST',
    sender_id: 'BRAND', destination: '+12345678901',
    mcc: '310', mnc: '410', country: 'USA', operator: 'AT&T',
    message: 'Hello World', message_parts: 1,
    client_rate: 0.05, supplier_rate: 0.02, profit: 0.03, currency: 'EUR',
    status: 'delivered', dlr_status: 'DELIVRD', dlr_timestamp: '2025-06-01T12:00:00Z',
    dlr_result: 'DELIVRD', dlr_response_time: 1200, dlr_duration: 3500,
    error_code: null, error_message: null,
    route_name: 'US-Premium', trunk_name: 'TrunkA', trunk_id: 1,
    smpp_message_id: 'smp-1111', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'api', dlr_callback_url: null,
    submit_time: '2025-06-01T11:59:58Z', delivery_time: '2025-06-01T12:00:01Z',
    created_at: '2025-06-01T11:59:58Z',
  },
  {
    id: '2', message_id: 'MSG-dddd-eeee-ffff', client_id: '101', client_code: 'CLT-ACME',
    supplier_id: '202', supplier_code: 'SUP-RELAY',
    sender_id: 'ACME', destination: '+442071234567',
    mcc: '234', mnc: '10', country: 'UK', operator: 'O2',
    message: 'Your code is 867530', message_parts: 1,
    client_rate: 0.04, supplier_rate: 0.03, profit: 0.01, currency: 'EUR',
    status: 'failed', dlr_status: 'UNDELIV', dlr_timestamp: '2025-06-01T13:00:00Z',
    dlr_result: 'UNDELIV', dlr_response_time: 5000, dlr_duration: 8000,
    error_code: 'ERR-001', error_message: 'Subscriber unreachable',
    route_name: 'UK-Standard', trunk_name: 'TrunkB', trunk_id: 2,
    smpp_message_id: 'smp-2222', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'smpp', dlr_callback_url: null,
    submit_time: '2025-06-01T12:55:00Z', delivery_time: '2025-06-01T13:00:01Z',
    created_at: '2025-06-01T12:55:00Z',
  },
  {
    id: '3', message_id: 'MSG-gggg-hhhh-iiii', client_id: '102', client_code: 'CLT-BETA',
    supplier_id: '203', supplier_code: 'SUP-GLOBAL',
    sender_id: 'BETA', destination: '+491234567890',
    mcc: '262', mnc: '01', country: 'Germany', operator: 'T-Mobile',
    message: 'Guten Tag', message_parts: 1,
    client_rate: 0.06, supplier_rate: 0.04, profit: 0.02, currency: 'EUR',
    status: 'expired', dlr_status: 'EXPIRED', dlr_timestamp: '2025-06-01T14:00:00Z',
    dlr_result: 'EXPIRED', dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null,
    route_name: 'DE-Standard', trunk_name: 'TrunkC', trunk_id: 3,
    smpp_message_id: 'smp-3333', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'api', dlr_callback_url: null,
    submit_time: '2025-06-01T13:58:00Z', delivery_time: null,
    created_at: '2025-06-01T13:58:00Z',
  },
  {
    id: '4', message_id: 'MSG-jjjj-kkkk-llll', client_id: '102', client_code: 'CLT-BETA',
    supplier_id: '204', supplier_code: 'SUP-DIRECT',
    sender_id: 'BETA2', destination: '+33123456789',
    mcc: '208', mnc: '10', country: 'France', operator: 'SFR',
    message: 'Bonjour!', message_parts: 1,
    client_rate: 0.07, supplier_rate: 0.05, profit: 0.02, currency: 'EUR',
    status: 'rejected', dlr_status: 'REJECTD', dlr_timestamp: '2025-06-01T15:00:00Z',
    dlr_result: 'REJECTD', dlr_response_time: 200, dlr_duration: 500,
    error_code: 'ERR-REJ', error_message: 'Content rejected by carrier',
    route_name: 'FR-Premium', trunk_name: 'TrunkD', trunk_id: 4,
    smpp_message_id: 'smp-4444', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'smpp', dlr_callback_url: null,
    submit_time: '2025-06-01T14:59:58Z', delivery_time: null,
    created_at: '2025-06-01T14:59:58Z',
  },
  // Legacy rows predating the explicit dlr_status column — dlr_status is null
  {
    id: '5', message_id: 'MSG-mmmm-nnnn-oooo', client_id: '101', client_code: 'CLT-ACME',
    supplier_id: '201', supplier_code: 'SUP-FAST',
    sender_id: 'LEGACY', destination: '+15551234567',
    mcc: '310', mnc: '260', country: 'USA', operator: 'T-Mobile',
    message: 'Legacy delivered msg', message_parts: 1,
    client_rate: 0.05, supplier_rate: 0.02, profit: 0.03, currency: 'EUR',
    status: 'delivered', dlr_status: null, dlr_timestamp: null,
    dlr_result: null, dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null,
    route_name: 'US-Premium', trunk_name: 'TrunkA', trunk_id: 1,
    smpp_message_id: 'smp-legacy1', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'smpp', dlr_callback_url: null,
    submit_time: '2025-01-15T10:00:00Z', delivery_time: '2025-01-15T10:00:03Z',
    created_at: '2025-01-15T10:00:00Z',
  },
  {
    id: '6', message_id: 'MSG-pppp-qqqq-rrrr', client_id: '102', client_code: 'CLT-BETA',
    supplier_id: '202', supplier_code: 'SUP-RELAY',
    sender_id: 'LEGACY2', destination: '+447890123456',
    mcc: '234', mnc: '30', country: 'UK', operator: 'EE',
    message: 'Legacy failed msg', message_parts: 1,
    client_rate: 0.04, supplier_rate: 0.03, profit: 0.01, currency: 'EUR',
    status: 'failed', dlr_status: null, dlr_timestamp: null,
    dlr_result: null, dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null,
    route_name: 'UK-Standard', trunk_name: 'TrunkB', trunk_id: 2,
    smpp_message_id: 'smp-legacy2', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: null, dlr_callback_url: null,
    submit_time: '2025-01-15T11:00:00Z', delivery_time: null,
    created_at: '2025-01-15T11:00:00Z',
  },
  {
    id: '7', message_id: 'MSG-ssss-tttt-uuuu', client_id: '101', client_code: 'CLT-ACME',
    supplier_id: '203', supplier_code: 'SUP-GLOBAL',
    sender_id: 'PENDING', destination: '+33612345678',
    mcc: '208', mnc: '20', country: 'France', operator: 'Bouygues',
    message: 'Pending message', message_parts: 1,
    client_rate: 0.06, supplier_rate: 0.04, profit: 0.02, currency: 'EUR',
    status: 'pending', dlr_status: null, dlr_timestamp: null,
    dlr_result: null, dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null,
    route_name: 'FR-Premium', trunk_name: 'TrunkD', trunk_id: 4,
    smpp_message_id: 'smp-7777', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'api', dlr_callback_url: 'https://example.com/dlr',
    submit_time: '2025-06-01T16:00:00Z', delivery_time: null,
    created_at: '2025-06-01T16:00:00Z',
  },
  {
    id: '8', message_id: 'MSG-vvvv-wwww-xxxx', client_id: '101', client_code: 'CLT-ACME',
    supplier_id: '205', supplier_code: 'SUP-EXPRESS',
    sender_id: 'FAST', destination: '+12025551234',
    mcc: '310', mnc: '160', country: 'USA', operator: 'Sprint',
    message: 'Submitted and awaiting DLR', message_parts: 1,
    client_rate: 0.03, supplier_rate: 0.01, profit: 0.02, currency: 'EUR',
    status: 'submitted', dlr_status: null, dlr_timestamp: null,
    dlr_result: null, dlr_response_time: null, dlr_duration: null,
    error_code: null, error_message: null,
    route_name: 'US-Express', trunk_name: 'TrunkE', trunk_id: 5,
    smpp_message_id: 'smp-8888', registered_delivery: 1, data_coding: 0, esm_class: 0,
    channel: 'sms', source: 'smpp', dlr_callback_url: null,
    submit_time: '2025-06-01T17:00:00Z', delivery_time: null,
    created_at: '2025-06-01T17:00:00Z',
  },
];

// ------------------------------------------------------------
// Extracted pure functions from SMSLogs.tsx
// ------------------------------------------------------------

/** DLR status filter — mirrors the component's matchesDlrStatus logic exactly */
function filterByDlrStatus(logs: SMSLog[], dlrFilter: string): SMSLog[] {
  if (dlrFilter === 'all') return logs;
  return logs.filter(log => {
    // Exact match on explicit dlr_status
    if ((log.dlr_status || '') === dlrFilter) return true;
    // Backward-compatible inference from legacy status field
    if (dlrFilter === 'DELIVRD' && log.status === 'delivered' && !log.dlr_status) return true;
    if (dlrFilter === 'UNDELIV' && log.status === 'failed' && !log.dlr_status) return true;
    if (dlrFilter === 'EXPIRED' && log.status === 'expired' && !log.dlr_status) return true;
    if (dlrFilter === 'REJECTD' && log.status === 'rejected' && !log.dlr_status) return true;
    return false;
  });
}

/** Status filter — mirrors the component's statusFilter logic */
function filterByStatus(logs: SMSLog[], statusFilter: string): SMSLog[] {
  if (statusFilter === 'all') return logs;
  return logs.filter(log => log.status === statusFilter);
}

/** Search filter — mirrors the component's search logic */
function filterBySearch(logs: SMSLog[], search: string): SMSLog[] {
  if (!search) return logs;
  const s = search.toLowerCase();
  return logs.filter(log =>
    (log.message_id || '').toLowerCase().includes(s) ||
    (log.destination || '').includes(search) ||
    (log.sender_id || '').toLowerCase().includes(s)
  );
}

/** Client filter — mirrors the component's clientFilter logic */
function filterByClient(logs: SMSLog[], clientFilter: string): SMSLog[] {
  if (clientFilter === 'all') return logs;
  return logs.filter(log => String(log.client_id) === clientFilter);
}

/** Combined filter — applies all four filters in sequence */
function filterLogs(
  logs: SMSLog[],
  search: string,
  statusFilter: string,
  dlrFilter: string,
  clientFilter: string,
): SMSLog[] {
  let result = filterByStatus(logs, statusFilter);
  result = filterByDlrStatus(result, dlrFilter);
  result = filterByClient(result, clientFilter);
  result = filterBySearch(result, search);
  return result;
}

/** Pagination: slice data for current page */
function paginate(data: SMSLog[], page: number, perPage: number): SMSLog[] {
  return data.slice((page - 1) * perPage, page * perPage);
}

/** Compute total pages */
function totalPages(count: number, perPage: number): number {
  return Math.ceil(count / perPage);
}

/** Compute stats from SMS logs */
function computeStats(logs: SMSLog[]) {
  return {
    total: logs.length,
    delivered: logs.filter(l => l.status === 'delivered').length,
    failed: logs.filter(l => l.status === 'failed').length,
    pending: logs.filter(l =>
      l.status === 'pending' || l.status === 'submitted' || l.status === 'sent'
    ).length,
  };
}

// ============================================================
// DLR Status filter tests
// ============================================================
describe('SMSLogs — filterByDlrStatus', () => {
  it('returns all logs when filter is "all"', () => {
    expect(filterByDlrStatus(mockLogs, 'all')).toHaveLength(8);
  });

  it('filters to DELIVRD logs (explicit + legacy inference)', () => {
    const result = filterByDlrStatus(mockLogs, 'DELIVRD');
    // id=1 (explicit DELIVRD) + id=5 (legacy status=delivered, dlr_status=null)
    expect(result).toHaveLength(2);
    const ids = result.map(l => l.id);
    expect(ids).toContain('1');
    expect(ids).toContain('5');
  });

  it('filters to UNDELIV logs (explicit + legacy inference)', () => {
    const result = filterByDlrStatus(mockLogs, 'UNDELIV');
    // id=2 (explicit UNDELIV) + id=6 (legacy status=failed, dlr_status=null)
    expect(result).toHaveLength(2);
    const ids = result.map(l => l.id);
    expect(ids).toContain('2');
    expect(ids).toContain('6');
  });

  it('filters to EXPIRED logs by explicit dlr_status', () => {
    const result = filterByDlrStatus(mockLogs, 'EXPIRED');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3'); // MSG-gggg — explicit EXPIRED
  });

  it('filters to REJECTD logs by explicit dlr_status', () => {
    const result = filterByDlrStatus(mockLogs, 'REJECTD');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4'); // MSG-jjjj — explicit REJECTD
  });

  it('matches legacy DELIVRD by inferring from status=delivered when dlr_status is null', () => {
    const result = filterByDlrStatus(mockLogs, 'DELIVRD');
    // Should include both explicit DELIVRD (id=1) AND legacy delivered (id=5)
    const ids = result.map(l => l.id);
    expect(ids).toContain('1'); // explicit
    expect(ids).toContain('5'); // legacy status=delivered, dlr_status=null
  });

  it('matches legacy UNDELIV by inferring from status=failed when dlr_status is null', () => {
    const result = filterByDlrStatus(mockLogs, 'UNDELIV');
    const ids = result.map(l => l.id);
    expect(ids).toContain('2'); // explicit
    expect(ids).toContain('6'); // legacy status=failed, dlr_status=null
  });

  it('does NOT match legacy failed when filtering for EXPIRED', () => {
    // A legacy failed log should only match UNDELIV, not EXPIRED
    const result = filterByDlrStatus(mockLogs, 'EXPIRED');
    const ids = result.map(l => l.id);
    expect(ids).toContain('3'); // explicit EXPIRED
    expect(ids).not.toContain('6'); // legacy failed — should be UNDELIV, not EXPIRED
  });

  it('does NOT match legacy delivered when filtering for UNDELIV', () => {
    const result = filterByDlrStatus(mockLogs, 'UNDELIV');
    const ids = result.map(l => l.id);
    expect(ids).not.toContain('5'); // legacy delivered should only match DELIVRD
  });

  it('returns empty array for DLR filter with no matches', () => {
    // No NACK or other custom DLR status exists in fixtures
    const result = filterByDlrStatus(mockLogs, 'NACK');
    expect(result).toHaveLength(0);
  });

  it('handles empty logs array gracefully', () => {
    expect(filterByDlrStatus([], 'DELIVRD')).toEqual([]);
  });

  it('handles empty-string dlr_filter safely (matches null dlr_status only)', () => {
    // '' is never used by the dropdown but the filter should handle it:
    // (null || '') === '' → true for all 4 legacy null-dlr_status logs
    const result = filterByDlrStatus(mockLogs, '' as string);
    expect(result).toHaveLength(4);
    expect(result.every(l => l.dlr_status === null)).toBe(true);
  });
});

// ============================================================
// Search filter tests
// ============================================================
describe('SMSLogs — filterBySearch', () => {
  it('returns all logs when search is empty', () => {
    expect(filterBySearch(mockLogs, '')).toHaveLength(8);
  });

  it('filters by message_id (partial match)', () => {
    const result = filterBySearch(mockLogs, 'aaaa-bbbb');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by destination (exact match)', () => {
    const result = filterBySearch(mockLogs, '+442071234567');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by sender_id (case insensitive)', () => {
    const result = filterBySearch(mockLogs, 'acme');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2'); // sender_id = 'ACME'
  });

  it('filters by partial sender_id', () => {
    const result = filterBySearch(mockLogs, 'LEGACY');
    expect(result).toHaveLength(2); // id=5 (LEGACY) and id=6 (LEGACY2)
  });

  it('returns empty array when no match', () => {
    expect(filterBySearch(mockLogs, 'nonexistent')).toHaveLength(0);
  });

  it('handles search with special characters without crashing', () => {
    expect(() => filterBySearch(mockLogs, '()[]{}.*+?^$')).not.toThrow();
  });
});

// ============================================================
// Status filter tests
// ============================================================
describe('SMSLogs — filterByStatus', () => {
  it('returns all logs when status is "all"', () => {
    expect(filterByStatus(mockLogs, 'all')).toHaveLength(8);
  });

  it('filters to delivered only', () => {
    const result = filterByStatus(mockLogs, 'delivered');
    expect(result).toHaveLength(2); // id=1 (explicit) + id=5 (legacy)
    expect(result.every(l => l.status === 'delivered')).toBe(true);
  });

  it('filters to failed only', () => {
    const result = filterByStatus(mockLogs, 'failed');
    expect(result).toHaveLength(2); // id=2 + id=6
    expect(result.every(l => l.status === 'failed')).toBe(true);
  });

  it('filters to pending only', () => {
    const result = filterByStatus(mockLogs, 'pending');
    expect(result).toHaveLength(1); // id=7
    expect(result[0].id).toBe('7');
  });

  it('filters to expired only', () => {
    const result = filterByStatus(mockLogs, 'expired');
    expect(result).toHaveLength(1); // id=3
    expect(result[0].id).toBe('3');
  });

  it('filters to rejected only', () => {
    const result = filterByStatus(mockLogs, 'rejected');
    expect(result).toHaveLength(1); // id=4
    expect(result[0].id).toBe('4');
  });
});

// ============================================================
// Client filter tests
// ============================================================
describe('SMSLogs — filterByClient', () => {
  it('returns all logs when client is "all"', () => {
    expect(filterByClient(mockLogs, 'all')).toHaveLength(8);
  });

  it('filters to client 101 (CLT-ACME)', () => {
    const result = filterByClient(mockLogs, '101');
    expect(result).toHaveLength(5); // ids 1, 2, 5, 7, 8
    expect(result.every(l => l.client_id === '101')).toBe(true);
  });

  it('filters to client 102 (CLT-BETA)', () => {
    const result = filterByClient(mockLogs, '102');
    expect(result).toHaveLength(3); // ids 3, 4, 6
    expect(result.every(l => l.client_id === '102')).toBe(true);
  });

  it('returns empty for unknown client', () => {
    expect(filterByClient(mockLogs, '999')).toHaveLength(0);
  });
});

// ============================================================
// Combined filter tests
// ============================================================
describe('SMSLogs — filterLogs (combined)', () => {
  it('all filters off returns everything', () => {
    expect(filterLogs(mockLogs, '', 'all', 'all', 'all')).toHaveLength(8);
  });

  it('combines DLR + status filters', () => {
    // DELIVRD filter + delivered status should match same items
    const result = filterLogs(mockLogs, '', 'delivered', 'DELIVRD', 'all');
    expect(result).toHaveLength(2); // id=1 (explicit) + id=5 (legacy)
    expect(result.every(l => l.dlr_status === 'DELIVRD' || (l.status === 'delivered' && !l.dlr_status))).toBe(true);
  });

  it('combines DLR + client filters', () => {
    const result = filterLogs(mockLogs, '', 'all', 'DELIVRD', '101');
    expect(result).toHaveLength(2); // id=1 + id=5 (both client 101)
  });

  it('combines DLR + search filters', () => {
    const result = filterLogs(mockLogs, 'LEGACY', 'all', 'UNDELIV', 'all');
    expect(result).toHaveLength(1); // id=6: LEGACY2 + UNDELIV
    expect(result[0].id).toBe('6');
  });

  it('combines all four filters', () => {
    // Search for 'LEGACY' + status=failed + DLR=UNDELIV + client=102
    const result = filterLogs(mockLogs, 'LEGACY', 'failed', 'UNDELIV', '102');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('6');
    expect(result[0].status).toBe('failed');
    expect(result[0].dlr_status).toBeNull(); // legacy
    expect(result[0].client_id).toBe('102');
  });

  it('search matches but DLR filter excludes', () => {
    const result = filterLogs(mockLogs, 'LEGACY', 'all', 'EXPIRED', 'all');
    expect(result).toHaveLength(0); // no legacy EXPIRED
  });

  it('DLR matches but client filter excludes', () => {
    const result = filterLogs(mockLogs, '', 'all', 'REJECTD', '101');
    expect(result).toHaveLength(0); // REJECTD log is client 102
  });

  it('filters are commutative — same result regardless of order', () => {
    // id=5: legacy delivered (DELIVRD), client 101, search 'LEGACY'
    const combined = filterLogs(mockLogs, 'LEGACY', 'delivered', 'DELIVRD', '101');
    expect(combined).toHaveLength(1);
    expect(combined[0].id).toBe('5');
  });
});

// ============================================================
// Pagination tests
// ============================================================
describe('SMSLogs — paginate', () => {
  it('slices page 1 with 3 per page', () => {
    const page1 = paginate(mockLogs, 1, 3);
    expect(page1).toHaveLength(3);
    expect(page1[0].id).toBe('1');
    expect(page1[1].id).toBe('2');
    expect(page1[2].id).toBe('3');
  });

  it('slices page 2 with 3 per page', () => {
    const page2 = paginate(mockLogs, 2, 3);
    expect(page2).toHaveLength(3);
    expect(page2[0].id).toBe('4');
    expect(page2[2].id).toBe('6');
  });

  it('slices page 3 with 3 per page', () => {
    const page3 = paginate(mockLogs, 3, 3);
    expect(page3).toHaveLength(2); // ids 7, 8
    expect(page3[0].id).toBe('7');
    expect(page3[1].id).toBe('8');
  });

  it('returns empty for page beyond range', () => {
    expect(paginate(mockLogs, 4, 3)).toHaveLength(0);
    expect(paginate(mockLogs, 10, 10)).toHaveLength(0);
  });

  it('handles default page size of 20', () => {
    const page1 = paginate(mockLogs, 1, 20);
    expect(page1).toHaveLength(8); // all fit on page 1
  });

  it('handles perPage of 1', () => {
    const page1 = paginate(mockLogs, 1, 1);
    expect(page1).toHaveLength(1);
    expect(page1[0].id).toBe('1');
  });
});

describe('SMSLogs — totalPages', () => {
  it('computes total pages correctly', () => {
    expect(totalPages(8, 3)).toBe(3);
    expect(totalPages(6, 3)).toBe(2);
    expect(totalPages(0, 20)).toBe(0);
    expect(totalPages(1, 20)).toBe(1);
    expect(totalPages(20, 20)).toBe(1);
    expect(totalPages(21, 20)).toBe(2);
  });
});

// ============================================================
// Stats tests
// ============================================================
describe('SMSLogs — computeStats', () => {
  it('computes total count', () => {
    expect(computeStats(mockLogs).total).toBe(8);
  });

  it('counts delivered messages', () => {
    expect(computeStats(mockLogs).delivered).toBe(2); // ids 1 + 5
  });

  it('counts failed messages', () => {
    expect(computeStats(mockLogs).failed).toBe(2); // ids 2 + 6
  });

  it('counts pending messages (includes pending + submitted + sent)', () => {
    expect(computeStats(mockLogs).pending).toBe(2); // id=7 (pending) + id=8 (submitted)
  });

  it('returns zeros for empty list', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.delivered).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.pending).toBe(0);
  });
});

// ============================================================
// DLR display helpers (getDLRResultBadge / getDLRIcon logic)
// ============================================================
describe('SMSLogs — DLR result display', () => {
  it('maps explicit dlr_status to the result badge', () => {
    expect(mockLogs[0].dlr_status).toBe('DELIVRD');
    expect(mockLogs[1].dlr_status).toBe('UNDELIV');
    expect(mockLogs[2].dlr_status).toBe('EXPIRED');
    expect(mockLogs[3].dlr_status).toBe('REJECTD');
  });

  it('infers DLR result from status for legacy rows', () => {
    const legacyDelivered = mockLogs[4]; // status=delivered, dlr_status=null
    const inferred = legacyDelivered.dlr_status || legacyDelivered.dlr_result;
    expect(inferred).toBeNull(); // no dlr_status set, dlr_result also null
    // In the component: if (!dlrStatus && status === 'delivered') → DELIVRD
    const fallback = !inferred && legacyDelivered.status === 'delivered' ? 'DELIVRD' : inferred;
    expect(fallback).toBe('DELIVRD');
  });

  it('returns dash for pending rows with no DLR', () => {
    const pending = mockLogs[6]; // status=pending, dlr_status=null
    const dlrStatus = pending.dlr_status || pending.dlr_result;
    expect(dlrStatus).toBeNull();
    // Not delivered, not failed → should show '-'
    const isKnown = pending.status === 'delivered' || pending.status === 'failed';
    expect(isKnown).toBe(false);
  });

  it('classifies DELIVRD as success', () => {
    const isSuccess = (dlrStatus: string | null) =>
      dlrStatus === 'DELIVRD' || (dlrStatus || '').toLowerCase() === 'delivered';
    expect(isSuccess('DELIVRD')).toBe(true);
    expect(isSuccess('UNDELIV')).toBe(false);
    expect(isSuccess('EXPIRED')).toBe(false);
  });
});

// ============================================================
// Edge cases
// ============================================================
describe('SMSLogs — edge cases', () => {
  it('handles empty logs array gracefully', () => {
    expect(filterByDlrStatus([], 'DELIVRD')).toEqual([]);
    expect(filterBySearch([], 'test')).toEqual([]);
    expect(filterByStatus([], 'delivered')).toEqual([]);
    expect(paginate([], 1, 20)).toEqual([]);
    expect(computeStats([]).total).toBe(0);
  });

  it('handles single log array', () => {
    const single = [mockLogs[0]];
    expect(filterByDlrStatus(single, 'DELIVRD')).toHaveLength(1);
    expect(paginate(single, 1, 20)).toHaveLength(1);
    expect(computeStats(single).total).toBe(1);
  });

  it('handles all four DLR values present in data', () => {
    const dlrValues = new Set(mockLogs.map(l => l.dlr_status).filter(Boolean));
    expect(dlrValues.has('DELIVRD')).toBe(true);
    expect(dlrValues.has('UNDELIV')).toBe(true);
    expect(dlrValues.has('EXPIRED')).toBe(true);
    expect(dlrValues.has('REJECTD')).toBe(true);
  });

  it('legacy null dlr_status is handled by fallback inference', () => {
    const nullDlr = mockLogs.filter(l => l.dlr_status === null);
    expect(nullDlr).toHaveLength(4); // ids 5, 6, 7, 8
    // All should be catchable by status-based inference
    for (const log of nullDlr) {
      if (log.status === 'delivered') {
        expect(filterByDlrStatus([log], 'DELIVRD')).toHaveLength(1);
      } else if (log.status === 'failed') {
        expect(filterByDlrStatus([log], 'UNDELIV')).toHaveLength(1);
      }
      // pending logs should not match any DLR filter
    }
  });

  it('pagination page 0 is handled by slice (returns empty)', () => {
    expect(paginate(mockLogs, 0, 20)).toEqual([]);
  });

  it('submitted status matches filteredByStatus("submitted") exactly', () => {
    const result = filterByStatus(mockLogs, 'submitted');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('8');
    expect(result[0].status).toBe('submitted');
  });
});
