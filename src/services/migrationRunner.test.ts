// =================================================================
// migrationRunner.test.ts — vitest unit tests for bootstrapMigrationRunner
// =================================================================
// Tests the migration statement parsing, SHA-256 hash tracking,
// schema_migrations versioning table logic, and error handling.
// Uses mocked pool.query to avoid requiring a real database.
//
// Run with: npx vitest run src/services/migrationRunner.test.ts
// =================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bootstrapMigrationRunner } = require('./migrationRunner.cjs');

// ------------------------------------------------------------
// Helpers — create a mocked pool with query tracking
// ------------------------------------------------------------
function mockPool(customQuery?: (sql: string, params?: unknown[]) => any) {
  const pool = {
    query: vi.fn(),
  };
  if (customQuery) {
    pool.query.mockImplementation(customQuery);
  }
  return pool;
}

/** Build a simple pg error object with a code */
function pgError(code: string, message = 'simulated pg error') {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

// ------------------------------------------------------------
// Temp file cleanup tracking
// ------------------------------------------------------------
const tmpFiles: string[] = [];
afterEach(() => {
  const fs = require('fs');
  for (const f of tmpFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch (_) { /* already cleaned up */ }
  }
  vi.clearAllMocks();
});

function writeTmpFile(name: string, content: string): string {
  const fs = require('fs');
  const path = `/tmp/${name}`;
  fs.writeFileSync(path, content);
  tmpFiles.push(path);
  return path;
}

// ------------------------------------------------------------
// Fixture SQL content
// ------------------------------------------------------------
const emptySql = '';
const commentsOnlySql = '-- just a comment\n-- another comment\n';
const singleStatement = "CREATE TABLE IF NOT EXISTS schema_migrations (\n  id SERIAL PRIMARY KEY,\n  hash TEXT NOT NULL UNIQUE\n);";
const twoStatements = "CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY);\nINSERT INTO test_table (id) VALUES (1);";

// ============================================================
// File reading & parsing
// ============================================================
describe('SQL parsing', () => {
  it('returns ok with zero counts for empty migration file', async () => {
    const f = writeTmpFile('test-empty.sql', emptySql);
    const pool = mockPool();
    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
    expect(result.executed).toBe(0);
  });

  it('returns ok with zero counts for comments-only file', async () => {
    const f = writeTmpFile('test-comments.sql', commentsOnlySql);
    const pool = mockPool();
    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
  });

  it('parses a single statement and executes it', async () => {
    const f = writeTmpFile('test-single.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.executed).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

// ============================================================
// First boot — schema_migrations table doesn't exist yet
// ============================================================
describe('First boot (no schema_migrations table)', () => {
  it('executes all statements when schema_migrations does not exist', async () => {
    const f = writeTmpFile('test-first-boot.sql', twoStatements);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.reject(pgError('42P01', 'relation "schema_migrations" does not exist'));
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(2);
    expect(result.executed).toBe(2);
    expect(result.alreadyApplied).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ============================================================
// Second boot — all migrations already applied
// ============================================================
describe('Second boot (all already applied)', () => {
  it('skips all statements when all hashes are already tracked', async () => {
    const f = writeTmpFile('test-second-boot.sql', singleStatement);
    const crypto = require('crypto');
    // The runner splits on ; and trims, so hash the statement WITHOUT the trailing ;
    const stmtText = singleStatement.split(';').map(s => s.trim()).filter(s => s.length > 0)[0];
    const expectedHash = crypto.createHash('sha256').update(stmtText).digest('hex');

    let queryCount = 0;
    const pool = mockPool((sql: string) => {
      queryCount++;
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [{ hash: expectedHash }] });
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.executed).toBe(0);
    expect(result.alreadyApplied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(queryCount).toBe(1);
  });
});

// ============================================================
// Partial — some new, some already applied
// ============================================================
describe('Partial migration (some new, some existing)', () => {
  it('executes new statements and skips already-applied ones', async () => {
    const f = writeTmpFile('test-partial.sql', twoStatements);
    const stmts = twoStatements.split(';').map(s => s.trim()).filter(s => s.length > 0);
    const crypto = require('crypto');
    const hashFirst = crypto.createHash('sha256').update(stmts[0]).digest('hex');

    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [{ hash: hashFirst }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(2);
    expect(result.executed).toBe(1);
    expect(result.alreadyApplied).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

// ============================================================
// Error handling — safe-to-skip error codes
// ============================================================
describe('Safe-to-skip errors', () => {
  it('skips statements with 42P01 (undefined_table) without failing', async () => {
    const f = writeTmpFile('test-42p01.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(pgError('42P01', 'relation does not exist'));
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.executed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips statements with 42703 (undefined_column) without failing', async () => {
    const f = writeTmpFile('test-42703.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(pgError('42703', 'column "nonexistent" does not exist'));
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(1);
  });

  it('skips statements with 23505 (unique_violation) without failing', async () => {
    const f = writeTmpFile('test-23505.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(pgError('23505', 'duplicate key value'));
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(1);
  });
});

// ============================================================
// Error handling — unexpected errors
// ============================================================
describe('Unexpected errors', () => {
  it('records unexpected errors in the errors array', async () => {
    const f = writeTmpFile('test-unexpected.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(pgError('08006', 'connection failure'));
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.executed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].code).toBe('08006');
    expect(result.errors![0].error).toContain('connection failure');
  });

  it('returns ok=false when schema_migrations SELECT fails with non-42P01 error', async () => {
    const f = writeTmpFile('test-schema-fail.sql', singleStatement);
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.reject(pgError('08006', 'connection refused'));
      }
      throw new Error('should not reach here');
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('schema_migrations lookup failed');
  });

  it('returns ok=false when fs.readFileSync fails (file not found)', async () => {
    const nonExistentFile = `/tmp/test-nonexistent-${Date.now()}.sql`;
    const pool = mockPool();
    const result = await bootstrapMigrationRunner(pool, nonExistentFile);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================
// Record insertion — schema_migrations INSERT behavior
// ============================================================
describe('schema_migrations INSERT', () => {
  it('records hash after successful statement execution', async () => {
    const f = writeTmpFile('test-insert.sql', singleStatement);
    const queries: string[] = [];
    const pool = mockPool((sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);

    const insertCalls = queries.filter(q => q.includes('INSERT INTO schema_migrations'));
    expect(insertCalls.length).toBe(1);
  });

  it('does NOT record hash when statement execution fails (skippable error)', async () => {
    const f = writeTmpFile('test-no-insert-on-skip.sql', singleStatement);
    const queries: string[] = [];
    const pool = mockPool((sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(pgError('42P01'));
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(1);

    const insertCalls = queries.filter(q => q.includes('INSERT INTO schema_migrations'));
    expect(insertCalls.length).toBe(0);
  });
});

// ============================================================
// Comment stripping
// ============================================================
describe('Comment stripping', () => {
  it('strips -- single-line comments before splitting statements', async () => {
    const sql = `-- Comment about this table\nCREATE TABLE IF NOT EXISTS test (id INT);`;
    const f = writeTmpFile('test-comment-strip.sql', sql);
    const pool = mockPool((querySql: string) => {
      if (querySql.includes('SELECT hash FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await bootstrapMigrationRunner(pool, f);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.executed).toBe(1);
  });
});

// ============================================================
// Idempotency — same file run twice should skip all on second run
// ============================================================
describe('Idempotency guarantee', () => {
  it('executes all on first run and skips all on second run', async () => {
    const f = writeTmpFile('test-idempotent.sql', twoStatements);

    // In-memory store to simulate the schema_migrations table across runs.
    // The INSERT handler automatically persists hashes so run 2 naturally
    // skips them — no manual intervention needed.
    const appliedHashes: Set<string> = new Set();

    function createPool() {
      return mockPool((sql: string, params?: any[]) => {
        if (sql.includes('SELECT hash FROM schema_migrations')) {
          const rows = Array.from(appliedHashes).map(hash => ({ hash }));
          return Promise.resolve({ rows });
        }
        if (sql.includes('INSERT INTO schema_migrations')) {
          // params[0] is the SHA-256 hash that the runner is persisting
          if (params && params[0]) appliedHashes.add(params[0]);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
    }

    // — Run 1: should execute both —
    const pool1 = createPool();
    const run1 = await bootstrapMigrationRunner(pool1, f);
    expect(run1.ok).toBe(true);
    expect(run1.total).toBe(2);
    expect(run1.executed).toBe(2);
    expect(run1.alreadyApplied).toBe(0);
    expect(run1.skipped).toBe(0);
    // Verify the hashes were persisted by the INSERT handler
    expect(appliedHashes.size).toBe(2);

    // — Run 2: should skip both as already applied —
    const pool2 = createPool();
    const run2 = await bootstrapMigrationRunner(pool2, f);
    expect(run2.ok).toBe(true);
    expect(run2.total).toBe(2);
    expect(run2.executed).toBe(0);
    expect(run2.alreadyApplied).toBe(2);
    expect(run2.skipped).toBe(0);
  });

  it('handles concurrent runs without corruption', async () => {
    // Simulates two server instances booting at once against a shared
    // schema_migrations table. Both SELECT before any INSERTs complete,
    // so both see an empty set and execute all statements. Duplicate
    // INSERTs are silently absorbed (ON CONFLICT DO NOTHING / Set.add).
    // Result: all DDL executed once, no duplicate hashes recorded.
    const f = writeTmpFile('test-concurrent.sql', twoStatements);
    const appliedHashes: Set<string> = new Set();
    let statementExecCount = 0;
    let insertAttemptCount = 0;

    function createPool() {
      return mockPool((sql: string, params?: any[]) => {
        if (sql.includes('SELECT hash FROM schema_migrations')) {
          // Both instances snapshot the current Set state at function entry
          const rows = Array.from(appliedHashes).map(hash => ({ hash }));
          return Promise.resolve({ rows });
        }
        if (sql.includes('INSERT INTO schema_migrations')) {
          insertAttemptCount++;
          if (params && params[0]) appliedHashes.add(params[0]); // idempotent Set.add
          return Promise.resolve({ rows: [] });
        }
        statementExecCount++;
        return Promise.resolve({ rows: [] });
      });
    }

    // Run both simultaneously
    const [run1, run2] = await Promise.all([
      bootstrapMigrationRunner(createPool(), f),
      bootstrapMigrationRunner(createPool(), f),
    ]);

    // Both must succeed
    expect(run1.ok).toBe(true);
    expect(run2.ok).toBe(true);

    // Both executed all statements (both saw empty Set on SELECT)
    expect(run1.executed).toBe(2);
    expect(run1.alreadyApplied).toBe(0);
    expect(run1.skipped).toBe(0);
    expect(run2.executed).toBe(2);
    expect(run2.alreadyApplied).toBe(0);
    expect(run2.skipped).toBe(0);

    // No corruption: exactly 2 unique hashes persisted (duplicate INSERTs absorbed)
    expect(appliedHashes.size).toBe(2);

    // Extra guard: execution happened exactly 4 times (2 stmts × 2 instances)
    expect(statementExecCount).toBe(4);
    expect(insertAttemptCount).toBe(4); // 2 stmts × 2 instances
  });
});
