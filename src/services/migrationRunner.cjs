// =================================================================
// Bootstrap Migration Runner — extracts from server.cjs for testability.
// Reads a SQL migration file, splits into idempotent statements, and
// executes them against the database with SHA-256 hash tracking in
// the schema_migrations table so re-boots skip already-applied DDL.
// =================================================================
const path = require('path');

async function bootstrapMigrationRunner(pool, migrationFilePath) {
  const targetPath = migrationFilePath || path.join(__dirname, '..', 'database', 'multi_channel_migrations.sql');
  const fs = require('fs');
  try {
    const sql = fs.readFileSync(targetPath, 'utf8');
    // Split on semicolons. Strip -- single-line comment lines (line-anchored
    // so string literals containing "--" aren't corrupted). Do NOT strip
    // /* */ block comments — PostgreSQL handles them natively, and a naive
    // regex would match inside string literals and corrupt data.
    // NOTE: the naive ; split won't handle semicolons inside string literals
    // or block comments. The current migration file has no such patterns.
    let cleaned = sql
      .replace(/^[ \t]*--[^\n]*/gm, '');             // strip comment-only lines
    const statements = cleaned
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (!statements.length) {
      return { ok: true, executed: 0, alreadyApplied: 0, skipped: 0, total: 0 };
    }

    // Ensure the versioning table exists first (the CREATE TABLE IF NOT EXISTS
    // in the first migration statement handles this, but we compute a hash
    // for it too). Schema migrations table stores SHA-256 hashes of applied
    // statements so re-boots skip already-executed DDL.
    const seen = new Set();
    try {
      const existing = await pool.query('SELECT hash FROM schema_migrations');
      for (const row of existing.rows) seen.add(row.hash);
    } catch (e) {
      if (e.code === '42P01') {
        // schema_migrations table doesn't exist yet — first boot
      } else {
        return { ok: false, error: `schema_migrations lookup failed: ${e.message}` };
      }
    }

    const crypto = require('crypto');
    let executed = 0;
    let skipped = 0;
    let alreadyApplied = 0;
    const errors = [];
    for (const stmt of statements) {
      const hash = crypto.createHash('sha256').update(stmt).digest('hex');

      if (seen.has(hash)) {
        alreadyApplied++;
        continue;
      }

      try {
        await pool.query(stmt);
        // Record the migration hash so it's skipped on future boots
        try {
          await pool.query(
            'INSERT INTO schema_migrations (hash, label) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING',
            [hash, stmt.substring(0, 200)]
          );
        } catch (_) {
          // schema_migrations insert failed — non-fatal (the statement DID execute)
        }
        seen.add(hash);
        executed++;
      } catch (e) {
        // Some migrations use INSERT...WHERE NOT EXISTS patterns that
        // are idempotent but may fail if dependent tables don't exist yet.
        // Log and continue — the next boot will retry.
        if (e.code === '42P01' || e.code === '42703' || e.code === '23505') {
          // undefined_table / undefined_column / unique_violation — safe to skip
          skipped++;
        } else {
          errors.push({ hash, error: e.message, code: e.code });
          skipped++;
        }
      }
    }
    return {
      ok: true,
      executed,
      alreadyApplied,
      skipped,
      total: statements.length,
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { bootstrapMigrationRunner };
