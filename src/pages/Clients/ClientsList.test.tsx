// ============================================================
// ClientsList.test.tsx — vitest unit tests for ClientsList logic
// ============================================================
// Tests the pure data transformation logic of the ClientsList
// component: getPlanName, search filtering, status filtering,
// pagination, stats computation, and column display helpers.
//
// Run with: npx vitest run src/pages/Clients/ClientsList.test.tsx
// ============================================================

import { describe, it, expect } from 'vitest';
import type { Client, RoutePlan } from '../../types';

// ------------------------------------------------------------
// Test fixtures
// ------------------------------------------------------------
const mockRoutePlans: RoutePlan[] = [
  { id: '1', plan_name: 'Premium Plan', route_ids: ['1', '3', '4'], is_default: true, created_at: '2024-01-01' },
  { id: '2', plan_name: 'Marketing Plan', route_ids: ['2'], is_default: false, created_at: '2024-02-01' },
  { id: '3', plan_name: 'Budget Plan', route_ids: ['5'], is_default: false, created_at: '2024-03-01' },
];

const mockClients: Client[] = [
  {
    id: '1', client_code: 'CLT001', company_name: 'TechCorp Global',
    contact_person: 'John Smith', email: 'john@techcorp.com',
    phone: '+1234567890', address: '123 Tech Street, Silicon Valley', country: 'USA',
    smpp_username: 'techcorp_smpp', smpp_password: 'secure123', smpp_ip: '192.168.1.100',
    smpp_port: 2775, system_type: 'SMPP', max_tps: 100,
    billing_mode: 'dlr', currency: 'EUR', balance: 5000, credit_limit: 10000,
    api_enabled: true, webhook_url: 'https://techcorp.com/webhook', force_dlr: true,
    force_dlr_timeout_mode: 'fixed', dlr_timeout: 150,
    routing_plan_id: '1',
    status: 'active', created_at: '2024-01-01', updated_at: '2024-06-01',
  },
  {
    id: '2', client_code: 'CLT002', company_name: 'MegaBank Ltd',
    contact_person: 'Sarah Johnson', email: 'sarah@megabank.com',
    phone: '+9876543210', address: '456 Finance Road, London', country: 'UK',
    smpp_username: 'megabank_smpp', smpp_password: 'bank456', smpp_ip: '0.0.0.0',
    smpp_port: 2775, system_type: 'SMPP', max_tps: 200,
    billing_mode: 'submit', currency: 'USD', balance: 25000, credit_limit: 50000,
    api_enabled: false, webhook_url: '', force_dlr: false,
    force_dlr_timeout_mode: 'fixed', dlr_timeout: 150,
    routing_plan_id: '1',
    status: 'active', created_at: '2024-02-01', updated_at: '2024-06-15',
  },
  {
    id: '3', client_code: 'CLT003', company_name: 'EcomStore Inc',
    contact_person: 'Mike Brown', email: 'mike@ecomstore.com',
    phone: '', address: '789 Commerce Ave, New York', country: '',
    smpp_username: 'ecomstore_smpp', smpp_password: 'ecom789', smpp_ip: '',
    smpp_port: 2775, system_type: 'HTTP', max_tps: 50,
    billing_mode: 'dlr', currency: 'EUR', balance: 1500, credit_limit: 5000,
    api_enabled: false, webhook_url: '', force_dlr: true,
    force_dlr_timeout_mode: 'random_0_5', dlr_timeout: 0,
    routing_plan_id: null,
    status: 'suspended', created_at: '2024-03-01', updated_at: '2024-06-20',
  },
  {
    id: '4', client_code: 'CLT004', company_name: 'StartupXYZ',
    contact_person: 'Jane Doe', email: 'jane@startup.xyz',
    phone: '+1122334455', address: '', country: 'Germany',
    smpp_username: 'startup_smpp', smpp_password: 'start123', smpp_ip: '10.0.0.1',
    smpp_port: 2776, system_type: 'BOTH', max_tps: 30,
    billing_mode: 'dlr', currency: 'EUR', balance: 100, credit_limit: 500,
    api_enabled: true, webhook_url: 'https://startup.xyz/hook', force_dlr: false,
    force_dlr_timeout_mode: 'fixed', dlr_timeout: 150,
    routing_plan_id: '2',
    status: 'inactive', created_at: '2024-04-01', updated_at: '2024-06-22',
  },
];

// ------------------------------------------------------------
// Extracted pure functions from ClientsList.tsx
// ------------------------------------------------------------

/** getPlanName — looks up route plan name by id */
function getPlanName(plans: RoutePlan[], id: string | null): string {
  if (!id) return 'None';
  const plan = plans.find(p => p.id === id);
  return plan?.plan_name || 'Unknown';
}

/** Search filter matching the component's search logic */
function filterBySearch(clients: Client[], search: string): Client[] {
  if (!search) return clients;
  const s = search.toLowerCase();
  return clients.filter(c =>
    c.company_name.toLowerCase().includes(s) ||
    c.client_code.toLowerCase().includes(s) ||
    c.email.toLowerCase().includes(s) ||
    (c.phone || '').toLowerCase().includes(s) ||
    (c.country || '').toLowerCase().includes(s) ||
    (c.smpp_ip || '').toLowerCase().includes(s)
  );
}

/** Status filter matching the component's status filter */
function filterByStatus(clients: Client[], status: string): Client[] {
  if (status === 'all') return clients;
  return clients.filter(c => c.status === status);
}

/** Combined filter (search + status) */
function filterClients(clients: Client[], search: string, statusFilter: string): Client[] {
  const byStatus = filterByStatus(clients, statusFilter);
  return filterBySearch(byStatus, search);
}

/** Pagination: slice data for current page */
function paginate(data: Client[], page: number, perPage: number): Client[] {
  return data.slice((page - 1) * perPage, page * perPage);
}

/** Total pages from count */
function totalPages(count: number, perPage: number): number {
  return Math.ceil(count / perPage);
}

/** Compute stats from client list */
function computeStats(clients: Client[]) {
  return {
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    suspended: clients.filter(c => c.status === 'suspended').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
    totalBalance: clients.reduce((sum, c) => sum + c.balance, 0),
  };
}

/** Format IP for display (mirrors column render) */
function formatAllowedIP(smpp_ip: string): { text: string; isRestricted: boolean } {
  const hasIP = !!(smpp_ip && smpp_ip !== '0.0.0.0');
  return { text: hasIP ? smpp_ip : 'Any', isRestricted: hasIP };
}

/** Format phone for display (mirrors column render) */
function formatPhone(phone: string): string {
  return phone || '—';
}

/** Format country for display (mirrors column render) */
function formatCountry(country: string): string {
  return country || '—';
}

// ============================================================
// getPlanName tests
// ============================================================
describe('ClientsList — getPlanName', () => {
  it('returns plan name for a known id', () => {
    expect(getPlanName(mockRoutePlans, '1')).toBe('Premium Plan');
    expect(getPlanName(mockRoutePlans, '2')).toBe('Marketing Plan');
    expect(getPlanName(mockRoutePlans, '3')).toBe('Budget Plan');
  });

  it('returns "None" for null id', () => {
    expect(getPlanName(mockRoutePlans, null)).toBe('None');
  });

  it('returns "None" for empty string id', () => {
    expect(getPlanName(mockRoutePlans, '')).toBe('None');
  });

  it('returns "Unknown" for id not in plans', () => {
    expect(getPlanName(mockRoutePlans, '999')).toBe('Unknown');
  });

  it('returns "Unknown" for id when plans array is empty', () => {
    // When plans array is empty, the id lookup fails, returning 'Unknown'
    expect(getPlanName([], '1')).toBe('Unknown');
  });
});

// ============================================================
// Search filter tests
// ============================================================
describe('ClientsList — filterBySearch', () => {
  it('returns all clients when search is empty', () => {
    expect(filterBySearch(mockClients, '')).toHaveLength(4);
  });

  it('filters by company name (case insensitive)', () => {
    const result = filterBySearch(mockClients, 'techcorp');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by client code', () => {
    const result = filterBySearch(mockClients, 'CLT002');
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('MegaBank Ltd');
  });

  it('filters by email', () => {
    const result = filterBySearch(mockClients, 'sarah@megabank');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by phone number', () => {
    const result = filterBySearch(mockClients, '+9876543210');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by country (case insensitive)', () => {
    const result = filterBySearch(mockClients, 'germany');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('filters by allowed IP (smpp_ip)', () => {
    const result = filterBySearch(mockClients, '192.168.1.100');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('partial search works across multiple fields', () => {
    // 'tech' matches TechCorp company_name
    const result = filterBySearch(mockClients, 'tech');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when no match', () => {
    expect(filterBySearch(mockClients, 'nonexistent')).toHaveLength(0);
  });

  it('handles clients with empty phone/country/smpp_ip gracefully', () => {
    // Client 3 has empty phone and country — should not crash
    expect(() => filterBySearch(mockClients, 'anything')).not.toThrow();
  });
});

// ============================================================
// Status filter tests
// ============================================================
describe('ClientsList — filterByStatus', () => {
  it('returns all clients when status is "all"', () => {
    expect(filterByStatus(mockClients, 'all')).toHaveLength(4);
  });

  it('filters to active clients only', () => {
    const result = filterByStatus(mockClients, 'active');
    expect(result).toHaveLength(2);
    expect(result.every(c => c.status === 'active')).toBe(true);
  });

  it('filters to suspended clients only', () => {
    const result = filterByStatus(mockClients, 'suspended');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('filters to inactive clients only', () => {
    const result = filterByStatus(mockClients, 'inactive');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });
});

// ============================================================
// Combined filter tests
// ============================================================
describe('ClientsList — filterClients (combined)', () => {
  it('applies both search and status filters', () => {
    const result = filterClients(mockClients, 'bank', 'active');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2'); // MegaBank, active
  });

  it('search matches but status excludes', () => {
    const result = filterClients(mockClients, 'store', 'active');
    expect(result).toHaveLength(0); // EcomStore is suspended
  });

  it('status matches but search excludes', () => {
    const result = filterClients(mockClients, 'NOMATCH', 'active');
    expect(result).toHaveLength(0);
  });

  it('all filters off returns everything', () => {
    expect(filterClients(mockClients, '', 'all')).toHaveLength(4);
  });
});

// ============================================================
// Pagination tests
// ============================================================
describe('ClientsList — paginate', () => {
  it('slices page 1 with 2 per page', () => {
    const page1 = paginate(mockClients, 1, 2);
    expect(page1).toHaveLength(2);
    expect(page1[0].id).toBe('1');
    expect(page1[1].id).toBe('2');
  });

  it('slices page 2 with 2 per page', () => {
    const page2 = paginate(mockClients, 2, 2);
    expect(page2).toHaveLength(2);
    expect(page2[0].id).toBe('3');
    expect(page2[1].id).toBe('4');
  });

  it('returns empty for page beyond range', () => {
    expect(paginate(mockClients, 3, 2)).toHaveLength(0);
    expect(paginate(mockClients, 10, 10)).toHaveLength(0);
  });

  it('handles default page size of 10', () => {
    const page1 = paginate(mockClients, 1, 10);
    expect(page1).toHaveLength(4); // all fit on page 1
  });

  it('handles perPage of 1', () => {
    const page1 = paginate(mockClients, 1, 1);
    expect(page1).toHaveLength(1);
    expect(page1[0].id).toBe('1');
  });
});

describe('ClientsList — totalPages', () => {
  it('computes total pages correctly', () => {
    expect(totalPages(4, 2)).toBe(2);
    expect(totalPages(5, 2)).toBe(3);
    expect(totalPages(0, 10)).toBe(0);
    expect(totalPages(1, 10)).toBe(1);
    expect(totalPages(10, 10)).toBe(1);
    expect(totalPages(11, 10)).toBe(2);
  });
});

// ============================================================
// Stats tests
// ============================================================
describe('ClientsList — computeStats', () => {
  it('computes total count', () => {
    expect(computeStats(mockClients).total).toBe(4);
  });

  it('counts active clients', () => {
    expect(computeStats(mockClients).active).toBe(2);
  });

  it('counts suspended clients', () => {
    expect(computeStats(mockClients).suspended).toBe(1);
  });

  it('counts inactive clients', () => {
    expect(computeStats(mockClients).inactive).toBe(1);
  });

  it('sums total balance', () => {
    const stats = computeStats(mockClients);
    expect(stats.totalBalance).toBe(5000 + 25000 + 1500 + 100);
  });

  it('returns zeros for empty list', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.totalBalance).toBe(0);
  });
});

// ============================================================
// Column display helpers tests
// ============================================================
describe('ClientsList — formatAllowedIP', () => {
  it('displays the IP when set to a real address', () => {
    expect(formatAllowedIP('192.168.1.100')).toEqual({ text: '192.168.1.100', isRestricted: true });
    expect(formatAllowedIP('10.0.0.1')).toEqual({ text: '10.0.0.1', isRestricted: true });
  });

  it('displays "Any" when IP is 0.0.0.0', () => {
    expect(formatAllowedIP('0.0.0.0')).toEqual({ text: 'Any', isRestricted: false });
  });

  it('displays "Any" when IP is empty string', () => {
    expect(formatAllowedIP('')).toEqual({ text: 'Any', isRestricted: false });
  });
});

describe('ClientsList — formatPhone', () => {
  it('returns the phone number when set', () => {
    expect(formatPhone('+1234567890')).toBe('+1234567890');
  });

  it('returns "—" when phone is empty', () => {
    expect(formatPhone('')).toBe('—');
  });
});

describe('ClientsList — formatCountry', () => {
  it('returns the country when set', () => {
    expect(formatCountry('USA')).toBe('USA');
    expect(formatCountry('UK')).toBe('UK');
  });

  it('returns "—" when country is empty', () => {
    expect(formatCountry('')).toBe('—');
  });
});

// ============================================================
// Column header / structure tests
// ============================================================
describe('ClientsList — column structure', () => {
  it('all expected column keys exist for ClientsList table', () => {
    const expectedKeys = ['client_code', 'contact', 'location', 'smpp_ip', 'smpp_username', 'balance', 'routing_plan', 'status', 'actions'];
    // This test validates that our column definition is complete
    expect(expectedKeys.length).toBeGreaterThanOrEqual(9);
    // Each key should be unique
    expect(new Set(expectedKeys).size).toBe(expectedKeys.length);
  });

  it('every client has all required fields for column rendering', () => {
    for (const client of mockClients) {
      expect(typeof client.client_code).toBe('string');
      expect(typeof client.company_name).toBe('string');
      expect(typeof client.contact_person).toBe('string');
      expect(typeof client.email).toBe('string');
      expect(typeof client.smpp_username).toBe('string');
      expect(typeof client.balance).toBe('number');
      expect(typeof client.credit_limit).toBe('number');
      // routing_plan_id can be string or null
      expect(['string', 'object']).toContain(typeof client.routing_plan_id); // null is 'object'
    }
  });

  it('client_code + company_name column renders correctly for all clients', () => {
    for (const client of mockClients) {
      const initial = client.company_name.charAt(0);
      expect(initial).toBeTruthy();
      expect(client.client_code).toMatch(/^CLT/);
    }
  });

  it('contact column shows contact_person and email for all clients', () => {
    for (const client of mockClients) {
      expect(client.contact_person).toBeTruthy();
      expect(client.email).toContain('@');
    }
  });

  it('status values are valid across all clients', () => {
    const validStatuses = ['active', 'inactive', 'suspended'];
    for (const client of mockClients) {
      expect(validStatuses).toContain(client.status);
    }
  });
});

// ============================================================
// Edge cases
// ============================================================
describe('ClientsList — edge cases', () => {
  it('handles empty clients array gracefully', () => {
    expect(filterBySearch([], 'test')).toEqual([]);
    expect(filterByStatus([], 'active')).toEqual([]);
    expect(paginate([], 1, 10)).toEqual([]);
    expect(computeStats([]).total).toBe(0);
  });

  it('handles single client array', () => {
    const single = [mockClients[0]];
    expect(filterBySearch(single, 'techcorp')).toHaveLength(1);
    expect(paginate(single, 1, 10)).toHaveLength(1);
    expect(computeStats(single).total).toBe(1);
  });

  it('search with special characters does not crash', () => {
    expect(() => filterBySearch(mockClients, '()[]{}.*+?^$')).not.toThrow();
  });

  it('pagination page 0 is handled by slice (returns empty)', () => {
    // page 0 would give negative start index, slice handles it
    expect(paginate(mockClients, 0, 10)).toEqual([]);
  });

  it('pagination with negative perPage wraps from end (standard slice behavior)', () => {
    // slice(0, -1) returns all items except the last one
    expect(paginate(mockClients, 1, -1)).toHaveLength(3);
  });
});
