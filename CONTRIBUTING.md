# Contributing to NET2APP Hub

Welcome! This guide is for anyone joining the project — local dev setup, the
typecheck pipeline, the test runner, and the smoke test cycle. The single most
important thing to read first is the **Ambient Type Workaround** section below;
it explains a sandbox-only workaround that some environments need and a clean
install can safely remove.

---

## Ambient Type Workaround (`src/types/react-dom-client.d.ts`) — read this first

The repository ships with a small ambient declaration file at
`src/types/react-dom-client.d.ts` and a `tsconfig.json` `compilerOptions.types:
[]` setting. **These are deliberate workarounds for sandbox / constrained
environments where `npm install` cannot reliably populate `node_modules`**
(`@types/react`, `@types/react-dom`, `@types/node`). In such environments npm
exits with code 0 but does not actually write the requested packages.

### What it does
1. `src/types/react-dom-client.d.ts` declares a minimal `react-dom/client`
   module surface (`createRoot`, `Root.render/unmount`) so `src/main.tsx` can
   typecheck without `@types/react-dom` being installed.
2. `tsconfig.json` `"types": []` prevents tsc from auto-loading
   `node_modules/@types/*` packages, which would otherwise error with TS2688
   (missing type definition files) when those packages are absent.

### When to delete it
After you run a successful `npm install` in a **clean environment** where the
installed packages actually land in `node_modules`, delete the workaround and
restore the standard configuration:

```sh
# 1. Verify real @types/* packages are installed (should print PRESENT 3x)
ls node_modules/@types/react node_modules/@types/react-dom node_modules/@types/node && echo OK

# 2. Remove the ambient workaround
rm src/types/react-dom-client.d.ts

# 3. Restore the standard tsconfig types
#    Edit tsconfig.json: "types": [] → "types": ["react", "react-dom"]

# 4. Verify the dependency-declared files match
#    package.json should still list @types/react, @types/react-dom, @types/node
#    in devDependencies.

# 5. Run a native tsc (no npx injection) to confirm clean compile
node_modules/.bin/tsc --noEmit
```

If step 1 finds any `@types/*` package missing, your install did not land the
packages — re-run `npm install --legacy-peer-deps` (Vite 8 + Vitest 4 in this
repo can have peer-dep conflicts without the flag) before deleting the
workaround.

### A historical note on `src/utils/smsHelpers.test.ts`
This file used to ship a `declare const process: { exit(code?: number): void };`
ambient for the same reason. Once the test file was converted to use vitest's
`describe`/`it`/`expect` API, the `process` declare was no longer needed and
was removed. **The vitest test file should not need any ambient declares even
in sandbox environments**, provided `vitest` itself is installed.

---

## Quick Start (clean environment)

> **First-time setup note**: if your clone came with `src/types/react-dom-client.d.ts`
> and `tsconfig.json` `"types": []` still in place (the sandbox-only workarounds
> documented in **Ambient Type Workaround** above), do the cleanup recipe FIRST
> before any of the typecheck or test commands below — otherwise `tsc --noEmit`
> will report TS2591 (`process`) and vitest will fail to import missing types.

```sh
git clone <repo> && cd net2app-v3

# 1. Install (peer-dep compat: vite ^8 vs vitest 4.x disagree on range overlap,
#    vite-plugin-singlefile wants node-fetch shims, etc.)
npm install --legacy-peer-deps

# 2. Frontend (Vite dev server on :5173, proxies /api → :3000)
npm run dev

# 3. Backend (Node Express on :3000, requires PostgreSQL)
node server.cjs

# 4. Type-check (no emit, native binary — make sure node_modules/.bin/tsc exists)
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc --noEmit -p tsconfig.node.json

# 5. Run tests (vitest — covers src/**/*.test.ts)
npm test
```

## Project Layout

- `src/` — React + TypeScript SPA (Vite). Entry: `src/main.tsx`.
- `src/store/DataContext.tsx` — single source of truth, all data flows through the API.
- `src/utils/smsHelpers.ts` — pure helpers for DLR rendering. Has 32 vitest tests in
  `src/utils/smsHelpers.test.ts`.
- `server.cjs` — Node Express backend on :3000 serving `/api/*` endpoints.
- `src/database/schema.sql` — PostgreSQL schema (consumers, suppliers, sms_logs, etc).
  Run this once on a fresh `sms_platform` database.
- `vitest.config.ts` — extends `vite.config.ts`; `test.environment: 'node'`,
  `test.include: ['src/**/*.test.{ts,tsx}']`.

## Type-checking

There are two tsconfig files:

- `tsconfig.json` — covers `src/` (the React SPA). Uses `"types": []` so it does
  not auto-include `node_modules/@types/*` (see workaround above).
- `tsconfig.node.json` — covers `vite.config.ts` + `vitest.config.ts`. Uses
  `"types": ["node"]`. Referenced from `tsconfig.json` via `references`.

To check both at once:
```sh
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```

If the native `tsc` binary is missing in your environment (broken install),
fall back to runtime injection:
```sh
npx --yes --package typescript@5.9.3 -- tsc --noEmit
```

## Tests

```sh
npm test                  # vitest run (one pass)
npm run test:watch        # vitest watch
```

Vitest uses `environment: 'node'` (configured in `vitest.config.ts`), so test
files can freely use `process`, `Buffer`, `fs`, etc. without ambient declares.

The standalone `assert()` + `process.exit(1)` runner format that the
`src/utils/smsHelpers.test.ts` file used to use is no longer supported; if you
add new tests, use `describe`/`it`/`expect`.

## Backend Smoke Test

Cycle against the live PostgreSQL backend — the script lives in the repo at
`scripts/smoke.sh`, so a fresh clone has it immediately:
```sh
# Kills any existing server, boots fresh on :3000, runs full CRUD on
# /api/route_maps (incl. the singleton GET endpoint), smoke-tests 11 other
# endpoints, asserts route_maps DB parity before/after, then cleanup.
bash scripts/smoke.sh
```

Manually (one-off curl call against the same endpoints):
```sh
psql -h localhost -U sms_user -d sms_platform -tA -c "SELECT count(*) FROM route_maps"
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  http://localhost:3000/api/auth/login | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/route_maps
```

## Pre-commit Hook

The repo ships a full-cycle pre-commit hook (`scripts/pre-commit`) that runs **`vitest` + `tsc --noEmit` + `bash scripts/smoke.sh`** before letting a commit land. Smoke is the slowest phase (~30s on a healthy backend) so there are bypass switches for fast iteration.

### One-off (no hook install) — `npm run verify`

If you want the same three-phase cycle *without* installing the git hook, run:

```sh
npm run verify
```

This composes the same phases into a single npm-script: `npm test && npx tsc --noEmit && bash scripts/smoke.sh`. Useful for ephemeral pre-commit checks on a fresh clone where you haven't run `install-hooks` yet, or for running the same cycle inside a CI pipeline that doesn't read `scripts/pre-commit`.

#### Bypass env-var behaviour

`SKIP_SMOKE=1 npm run verify` works as expected because `bash scripts/smoke.sh` reads its own `SKIP_SMOKE` flag. `SKIP_TESTS=1` and `SKIP_TSC=1` do **not** skip their phases here — vitest and tsc don't read those env vars. The hook has the flags wired into its own script body, which is why it works there; the npm alias doesn't have that plumbing.

If you need bypasses via npm, run the phases manually:

```sh
SKIP_TESTS=1 npm test
SKIP_TSC=1 npx tsc --noEmit
SKIP_SMOKE=1 bash scripts/smoke.sh
```

#### Partial-failure behaviour

Unlike the hook (which is `set -e` short-circuit), the npm-script's `&&` chain stops at the *first* non-zero exit. If you want all three phases to run even on partial failure, drop `npm run` and invoke each phase directly with `;`:

```sh
npm test ; npx tsc --noEmit ; bash scripts/smoke.sh
```

Each phase runs regardless of prior failure, so you'll see all defects in one go. Note that npm only reports the **last** command's exit code, so if vitest fails first you'll still see smoke.sh's exit status reflected — check the prior lines for which phase actually tripped.
### Install once after a fresh clone

```sh
bash scripts/install-hooks.sh        # or:  npm run install-hooks
```

This copies `scripts/pre-commit` into `.git/hooks/pre-commit` and `chmod +x` it. The installer is idempotent — any existing pre-commit hook gets backed up under `.git/hooks/pre-commit.backup.<timestamp>` before being replaced. It also bails gracefully (exit 0) when there's no `.git/` (tarball download, shallow checkout, CI workspace, etc.).

### Bypass escape hatches

```sh
git commit --no-verify                       # git's standard bypass (all phases)
SKIP_SMOKE=1 git commit ...                  # skip backend smoke (front-end only changes)
SKIP_TSC=1   git commit ...                  # skip typecheck (intentional WIP)
SKIP_TESTS=1 git commit ...                  # skip vitest (cosmetic-only changes)
```

Prefer the targeted `SKIP_*` flags over `--no-verify` so each bypass is self-documenting in commit logs.

## Continuous Integration

Every PR (and every push to `main`) goes through `.github/workflows/ci.yml`, which runs the same three phases as the local pre-commit hook — but on a clean ubuntu runner with a fresh PostgreSQL sidecar.

### What runs, and in what order

1. **Setup** — checkout + Node 22 (pinned to match Vite 8's engine range) + npm cache.
2. **`npm ci --legacy-peer-deps`** — strict install against `package-lock.json`.
3. **`apt-get install postgresql-client`** — `psql` is needed both for the schema-load step *and* inside `scripts/smoke.sh`.
4. **`psql -f src/database/schema.sql`** — bootstraps a clean `sms_platform` from scratch on every run.
5. **`npm test`** — vitest unit tests (mirrors local phase 1).
6. **`npx tsc --noEmit`** — typecheck (mirrors local phase 2).
7. **`bash scripts/smoke.sh`** — boots `node server.cjs` against the freshly-loaded DB, smokes 12 endpoints, asserts DB parity, exits 0 on full pass.

Fail-fast: if vitest fails, tsc + smoke are skipped; if tsc fails, smoke is skipped. This mirrors the local hook's `set -e` short-circuit. To opt out of fail-fast and surface all phase defects in one run, split into parallel jobs (TODO note at the bottom of `ci.yml`).

### Why `postgres:16` not `postgres:latest`

`postgres:16` is the LTS-style choice that has stable GitHub Actions healthcheck behaviour and matches the schema in `src/database/schema.sql`. Pinning to a major version avoids surprise breakage when `:latest` rolls forward.

### Why `JWT_SECRET` is set

Without it, `server.cjs` falls back to `'net2app-hub-' + Date.now()`, producing a different secret on every CI run and making log diffs harder to scan. The CI secret value (`ci-test-jwt-secret-not-for-production`) is intentionally a clearly-not-a-secret placeholder — it does NOT carry privileged access.

### Smoke-log artifact on failure

If `bash scripts/smoke.sh` ever fails, the workflow uploads `/tmp/srv_smoke.log` as a GH Actions artifact (`srv-smoke-log`) so you can read why `node server.cjs` didn't come up without re-running CI locally.

### Local-vs-CI divergence

The CI runs the same three phases as the local pre-commit hook. If a PR passes locally (via `bash scripts/install-hooks.sh`) but fails in CI, the culprit is almost always one of:

- **Outdated `package-lock.json`** — pin dependencies and re-run `npm install --legacy-peer-deps`, then commit the lockfile.
- **Schema drift** — the CI loads `src/database/schema.sql` from HEAD on a clean DB, but your local DB may have older migrations applied. Drop & reload locally.
- **Missing env vars** — the workflow defines `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_PASSWORD`, `PGPASSWORD`, `JWT_SECRET`, `NODE_ENV`. If you see `[bootstrap] migration failed` warnings locally, double-check your `.env` (or pass them inline).

To reproduce CI locally, you can `bash scripts/smoke.sh` against any local PG instance with `src/database/schema.sql` loaded — the only CI-specific thing is the deterministic `JWT_SECRET`.

## Common Gotchas

1. **Sandbox npm cache** — `npm install` may exit 0 without writing files. Try
   `npm cache clean --force && rm -rf node_modules && npm install --legacy-peer-deps --no-package-lock`.
2. **`@types/react-dom` TS7016 / TS2688** — see the ambient workaround above.
3. **Vite plugin peer-deps** — this combination has cross-package peer
   overlap between Vite 8 + Vitest 4 + Tailwind 4 + vite-plugin-singlefile.
   The combinations have been observed to fail strict-resolution install;
   `--legacy-peer-deps` keeps npm's legacy resolver (which still validates
   against peers but tolerates loose overlaps) in play. `--force` works in
   a pinch, but it can silently pin to outdated peer ranges; we recommend
   `--legacy-peer-deps` first. If a future bump fixes the peer overlap,
   you can drop the flag.
4. **PostgreSQL connection** — `server.cjs` expects `sms_platform` on
   `localhost:5432` user `sms_user`. Adjust in `database/postgresql.ts` if
   you run remotely.
5. **Singleton GET endpoints** — `server.cjs` registers
   `GET /api/:table/:id` for these tables: `route_maps`, `trunks`, `routes`,
   `route_plans`, `campaigns`, `clients`, `suppliers`, `users`, `invoices`,
   `payments`, `notification_templates`, `ott_devices`, `api_connectors`.
   The `/api/clients/:id/api-key` POST is unaffected. **Note**: `/api/api_keys`
   is NOT covered by `server.cjs`'s generic CRUD loop — `server.cjs` only
   handles the `tables` listed above. The `api_keys` CRUD endpoints live in
   a separate handler registration (likely one of the `*-api.cjs` modules
   with its own auth code path). If you need to find the exact wiring,
   `grep -rn 'api_keys' --include='*.cjs'` will surface it. `scripts/smoke.sh`
   intentionally skips `/api/api_keys` because it would 404 against the
   plain Express-style endpoints.

## Related Docs

- `API_DOCUMENTATION.md` — endpoint reference
- `SMS_FLOW_AND_DATABASE_SCHEMA.md` — schema + SMS submission path
- `UPDATE_FRONTEND.md` — last frontend change summary
- `DEPLOY_HTTPS.md` — production deployment notes

## SMPP Protocol-Version Handling (v3.3 / v3.4 / v5.0)

The supplier bind flow supports **auto-detection** of SMPP versions via the `suppliers.smpp_version` column. Wire-protocol negotiation happens in the **Java 21 SMPP Gateway** (out-of-repo); the Node side records configuration + the negotiated result.

### Setting a supplier's preferred version

`suppliers.smpp_version` accepts `'auto' | '3.3' | '3.4' | '5.0'` (DEFAULT `'auto'`). Set it via the suppliers form / `PUT /api/suppliers/:id` body, or directly in psql.

| Value | Wire byte | Description |
|-------|-----------|-------------|
| `'auto'` | (absent) | Java gateway picks the highest version the SMSC accepts. Default. |
| `'3.3'` | `0x33` | Forces SMPP v3.3 bind. Use for SMSCs that reject newer versions. |
| `'3.4'` | `0x34` | Industry standard. Use when v5 features aren't required. |
| `'5.0'` | `0x50` | SMPP v5 (rare). Use only for SMSCs that advertise v5 support. |

The mapping is implemented in `server.cjs`'s `smppVersionToByte()` and applied when `POST /api/bind/:id/connect` calls into `gateway-bridge.cjs`'s `bridge.bindSupplier()`.

### Reading the negotiated version back

Java's `bind_resp` PDU echoes the negotiated version byte in the same `interface_version` field. Java forwards this to Node via `POST /internal/esme_bind_event`, where `server.cjs`'s `smppByteToVersion()` maps the byte into a string and writes it to `smpp_sessions.negotiated_version` — visible immediately on `/api/bind/status` (single supplier) / `/api/bind/status` (all).

### Migration / rollback

The schema changes are forward-compatible. For a fresh database, just reload `src/database/schema.sql`. For an existing database, append the migration block at the END of the schema (added in this revision):

```sql
-- Idempotent ALTERs for SMPP version handling
ALTER TABLE suppliers        ADD COLUMN IF NOT EXISTS smpp_version VARCHAR(10) DEFAULT 'auto' CHECK (smpp_version IN ('auto','3.3','3.4','5.0'));
ALTER TABLE smpp_sessions    ADD COLUMN IF NOT EXISTS negotiated_version VARCHAR(10);
```

Both `ADD COLUMN IF NOT EXISTS` statements are safe to run repeatedly. Existing suppliers default to `'auto'`; existing sessions carry `null` negotiated_version until their next bind captures one.

### Why this is in Node, not Java

The full v3.3/v3.4/v5 negotiation behaviour (retry on protocol-version mismatch, version-probing, etc.) lives in the Java SMPP gateway's bind logic. The Node side is intentionally thin: configuration in `suppliers.smpp_version` (one column), wire-byte translation in 2 tiny helpers, and persistent capture in `smpp_sessions.negotiated_version`. If you need to add Java-side retry/probe logic, that's a separate Java-only change.
