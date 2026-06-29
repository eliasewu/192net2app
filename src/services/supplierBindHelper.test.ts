// ============================================================
// supplierBindHelper.test.ts — Vitest unit tests for
// createPerformSupplierBind, createPerformSupplierUnbind,
// smppVersionToByte, smppByteToVersion
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createPerformSupplierBind,
  createPerformSupplierUnbind,
  smppVersionToByte,
  smppByteToVersion,
} = require('./supplierBindHelper.cjs');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

interface MockPool {
  query: ReturnType<typeof vi.fn>;
  calls: { sql: string; params: unknown[] }[];
}

function mockPool(): MockPool {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn((sql: string, params: unknown[]) => {
    calls.push({ sql, params: params || [] });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return { query, calls };
}

interface MockBridge {
  bindSupplierLongTimeout: ReturnType<typeof vi.fn>;
  unbindSupplier: ReturnType<typeof vi.fn>;
}

function mockBridge(): MockBridge {
  return {
    bindSupplierLongTimeout: vi.fn(),
    unbindSupplier: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSupplier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    supplier_code: 'TEST01',
    company_name: 'Test Supplier',
    connection_type: 'smpp',
    smpp_host: '10.0.0.1',
    smpp_port: 2775,
    smpp_username: 'test_user',
    smpp_password: 'test_pass',
    smpp_version: '3.4',
    status: 'active',
    bind_status: 'unbound',
    consecutive_failures: 0,
    ...overrides,
  };
}

// ============================================================
// smppVersionToByte
// ============================================================
describe('smppVersionToByte', () => {
  it('returns 0x33 for "3.3"', () => {
    expect(smppVersionToByte('3.3')).toBe(0x33);
  });
  it('returns 0x34 for "3.4"', () => {
    expect(smppVersionToByte('3.4')).toBe(0x34);
  });
  it('returns 0x50 for "5.0"', () => {
    expect(smppVersionToByte('5.0')).toBe(0x50);
  });
  it('returns null for "auto"', () => {
    expect(smppVersionToByte('auto')).toBeNull();
  });
  it('returns null for null/undefined/empty-string', () => {
    expect(smppVersionToByte(null)).toBeNull();
    expect(smppVersionToByte(undefined)).toBeNull();
    expect(smppVersionToByte('')).toBeNull();
  });
  it('returns null for unknown version strings', () => {
    expect(smppVersionToByte('2.0')).toBeNull();
    expect(smppVersionToByte('banana')).toBeNull();
    expect(smppVersionToByte('6.0')).toBeNull();
  });
});

// ============================================================
// smppByteToVersion
// ============================================================
describe('smppByteToVersion', () => {
  it('returns "3.3" for 0x33', () => {
    expect(smppByteToVersion(0x33)).toBe('3.3');
  });
  it('returns "3.4" for 0x34', () => {
    expect(smppByteToVersion(0x34)).toBe('3.4');
  });
  it('returns "5.0" for 0x50', () => {
    expect(smppByteToVersion(0x50)).toBe('5.0');
  });
  it('returns null for unknown bytes', () => {
    expect(smppByteToVersion(0x00)).toBeNull();
    expect(smppByteToVersion(0xFF)).toBeNull();
    expect(smppByteToVersion(42)).toBeNull();
    expect(smppByteToVersion(undefined)).toBeNull();
  });
});

// ============================================================
// performSupplierBind — success path
// ============================================================
describe('performSupplierBind — success', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('sets supplier to binding, calls gateway, sets to bound on success', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });

    const result = await bind(supplier);

    expect(result.ok).toBe(true);
    expect(result.negotiatedVersion).toBe('3.4');
    expect(result.negotiatedHex).toBe('34');
    expect(result.interfaceByte).toBe(0x34);

    // DB call 0: suppliers → binding
    expect(pool.calls[0].sql).toContain("bind_status='binding'");
    expect(pool.calls[0].params[0]).toBe(supplier.id);
    // DB call 1: smpp_sessions UPSERT
    expect(pool.calls[1].sql).toContain('INSERT INTO smpp_sessions');
    // Gateway called between DB writes
    expect(bridge.bindSupplierLongTimeout).toHaveBeenCalledWith({
      supplier_id: supplier.id,
      smpp_host: supplier.smpp_host,
      smpp_port: supplier.smpp_port,
      smpp_username: supplier.smpp_username,
      smpp_password: supplier.smpp_password,
      system_type: '',
      bind_type: 'trx',
      addr_ton: 0,
      addr_npi: 0,
      addr_range: 'system_id',
      interface_version: 0x34,
    });
    // DB call 2: suppliers → bound
    expect(pool.calls[2].sql).toContain("bind_status='bound'");
    expect(pool.calls[2].sql).toContain('consecutive_failures=0');
    expect(pool.calls[2].params[0]).toBe(supplier.id);
    // DB call 3: smpp_sessions → bound
    expect(pool.calls[3].sql).toContain("status='bound'");
    expect(pool.calls[3].sql).toContain('negotiated_version=$2');
    expect(pool.calls[3].params[1]).toBe('3.4');
  });

  it('passes null interface_version when smpp_version is "auto"', async () => {
    const supplier = makeSupplier({ smpp_version: 'auto' });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier);
    expect(bridge.bindSupplierLongTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ interface_version: null }),
    );
  });

  it('handles negotiated_interface_version = null (unknown version)', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: null,
    });
    const result = await bind(supplier);
    expect(result.ok).toBe(true);
    expect(result.negotiatedVersion).toBeNull();
    expect(result.negotiatedHex).toBeNull();
    expect(pool.calls[3].params[1]).toBeNull();
  });
});

// ============================================================
// performSupplierBind — supplier rejects
// ============================================================
describe('performSupplierBind — supplier rejects', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('sets supplier to error and increments consecutive_failures on rejection', async () => {
    const supplier = makeSupplier({ consecutive_failures: 3 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: false, reason: 'ESME_RBINDFAIL',
    });

    const result = await bind(supplier);

    expect(result.ok).toBe(false);
    expect(result.gatewayDown).toBe(false);
    // DB call 2: suppliers → error
    expect(pool.calls[2].sql).toContain("bind_status='error'");
    expect(pool.calls[2].sql).toContain('consecutive_failures=consecutive_failures+1');
    expect(pool.calls[2].params[0]).toBe(supplier.id);
    // DB call 3: smpp_sessions → error
    expect(pool.calls[3].sql).toContain("status='error'");
    expect(pool.calls[3].sql).toContain("entity_type='supplier'");
  });
});

// ============================================================
// performSupplierBind — gateway down
// ============================================================
describe('performSupplierBind — gateway down', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('returns gatewayDown=true when bridge returns null', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce(null);

    const result = await bind(supplier);

    expect(result.ok).toBe(false);
    expect(result.gatewayDown).toBe(true);
    expect(pool.calls[2].sql).toContain("bind_status='error'");
  });
});

// ============================================================
// performSupplierBind — resetFailures
// ============================================================
describe('performSupplierBind — resetFailures', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('zeros consecutive_failures in the binding transition when resetFailures=true', async () => {
    const supplier = makeSupplier({ consecutive_failures: 5 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier, { resetFailures: true });
    expect(pool.calls[0].sql).toContain('consecutive_failures=0');
    expect(pool.calls[0].sql).toContain("bind_status='binding'");
  });

  it('does NOT zero failures in default mode (resetFailures=false)', async () => {
    const supplier = makeSupplier({ consecutive_failures: 5 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier);
    expect(pool.calls[0].sql).not.toContain('consecutive_failures');
    expect(pool.calls[0].sql).toContain("bind_status='binding'");
  });
});

// ============================================================
// performSupplierBind — incrementBoundCount
// ============================================================
describe('performSupplierBind — incrementBoundCount', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('includes bound_count increment on success when incrementBoundCount=true', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier, { incrementBoundCount: true });
    expect(pool.calls[3].sql).toContain('bound_count = bound_count + 1');
  });

  it('does NOT include bound_count increment when incrementBoundCount=false', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier);
    expect(pool.calls[3].sql).not.toContain('bound_count');
  });

  it('does NOT include bound_count on failure even if option is set', async () => {
    const supplier = makeSupplier();
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({ ok: false });
    await bind(supplier, { incrementBoundCount: true });
    expect(pool.calls[3].sql).toContain("status='error'");
    const sessionCalls = pool.calls.filter((c) => c.sql.includes('smpp_sessions'));
    expect(sessionCalls.every((c) => !c.sql.includes('bound_count'))).toBe(true);
  });
});

// ============================================================
// performSupplierBind — SQL parameter binding
// ============================================================
describe('performSupplierBind — SQL parameter binding', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('binds supplier.id as $1 in the binding-state UPDATE', async () => {
    const supplier = makeSupplier({ id: 42 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier);
    expect(pool.calls[0].params[0]).toBe(42);
  });

  it('binds smpp_username, smpp_host, smpp_port in the smpp_sessions UPSERT', async () => {
    const supplier = makeSupplier({
      id: 7, smpp_username: 'myuser', smpp_host: '192.168.1.100', smpp_port: 2776,
    });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '34',
    });
    await bind(supplier);
    expect(pool.calls[1].params[0]).toBe(7);
    expect(pool.calls[1].params[1]).toBe('myuser');
    expect(pool.calls[1].params[2]).toBe('192.168.1.100');
    expect(pool.calls[1].params[3]).toBe(2776);
  });

  it('binds supplier.id and negotiated_version in the bound smpp_sessions UPDATE', async () => {
    const supplier = makeSupplier({ id: 99 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '50',
    });
    await bind(supplier);
    const last = [...pool.calls].reverse().find((c) => c.sql.includes('UPDATE smpp_sessions'));
    expect(last?.params[0]).toBe(99);
    expect(last?.params[1]).toBe('5.0');
  });

  it('binds NULL for negotiated_version when negotiatedHex is null', async () => {
    const supplier = makeSupplier({ id: 1 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: null,
    });
    await bind(supplier);
    const last = [...pool.calls].reverse().find((c) => c.sql.includes('UPDATE smpp_sessions'));
    expect(last?.params[1]).toBeNull();
  });
});

// ============================================================
// performSupplierBind — combined options
// ============================================================
describe('performSupplierBind — combined options', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let bind: ReturnType<typeof createPerformSupplierBind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    bind = createPerformSupplierBind(pool as never, bridge as never);
  });

  it('resetFailures=true + incrementBoundCount=true on success', async () => {
    const supplier = makeSupplier({ consecutive_failures: 10 });
    bridge.bindSupplierLongTimeout.mockResolvedValueOnce({
      ok: true, negotiated_interface_version: '33',
    });
    await bind(supplier, { resetFailures: true, incrementBoundCount: true });
    expect(pool.calls[0].sql).toContain('consecutive_failures=0');
    expect(pool.calls[3].sql).toContain('bound_count = bound_count + 1');
    expect(pool.calls[2].sql).toContain('consecutive_failures=0');
  });
});

// ============================================================
// performSupplierUnbind — new tests
// ============================================================
describe('performSupplierUnbind', () => {
  let pool: MockPool;
  let bridge: MockBridge;
  let unbind: ReturnType<typeof createPerformSupplierUnbind>;

  beforeEach(() => {
    pool = mockPool();
    bridge = mockBridge();
    unbind = createPerformSupplierUnbind(pool as never, bridge as never);
  });

  it('calls bridge.unbindSupplier with the supplier ID (fire-and-forget)', async () => {
    await unbind(42);
    expect(bridge.unbindSupplier).toHaveBeenCalledWith(42);
    expect(bridge.unbindSupplier).toHaveBeenCalledTimes(1);
  });

  it('updates suppliers to bind_status=unbound with correct parameter', async () => {
    await unbind(7);
    expect(pool.calls[0].sql).toContain("bind_status='unbound'");
    expect(pool.calls[0].sql).toContain('WHERE id=$1');
    expect(pool.calls[0].params).toEqual([7]);
  });

  it('updates smpp_sessions to status=unbound with disconnected_at and correct entity_id', async () => {
    await unbind(99);
    expect(pool.calls[1].sql).toContain("status='unbound'");
    expect(pool.calls[1].sql).toContain('disconnected_at=NOW()');
    expect(pool.calls[1].sql).toContain("entity_type='supplier'");
    expect(pool.calls[1].params).toEqual([99]);
  });

  it('passes any supplierId value through to bridge and DB (string IDs)', async () => {
    await unbind('42' as unknown as number);
    expect(pool.calls[0].params).toEqual(['42']);
    expect(pool.calls[1].params).toEqual(['42']);
    expect(bridge.unbindSupplier).toHaveBeenCalledWith('42');
  });

  it('calls bridge.unbindSupplier before awaiting DB writes', async () => {
    const callOrder: string[] = [];
    const origUnbind = bridge.unbindSupplier.getMockImplementation() as ((id: number) => any) | undefined;
    bridge.unbindSupplier.mockImplementation((id: number) => {
      callOrder.push('bridge');
      return origUnbind?.(id) ?? Promise.resolve();
    });
    const origQuery = pool.query.getMockImplementation() as ((sql: string, params: unknown[]) => any) | undefined;
    pool.query.mockImplementation((sql: string, params: unknown[]) => {
      callOrder.push('db');
      return origQuery?.(sql, params) ?? Promise.resolve({ rows: [], rowCount: 0 });
    });

    await unbind(1);
    expect(callOrder[0]).toBe('bridge');
  });

  it('does not throw even if bridge.unbindSupplier rejects (fire-and-forget)', async () => {
    bridge.unbindSupplier.mockRejectedValueOnce(new Error('gateway down'));
    await expect(unbind(1)).resolves.toBeUndefined();
    expect(pool.calls[0].sql).toContain("bind_status='unbound'");
    expect(pool.calls[1].sql).toContain("status='unbound'");
  });
});
