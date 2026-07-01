# NET2APP Hub — Translation Engine

> In-flight SMS content manipulation — sender_id masking, content replacement, destination formatting, and OTP extraction. Applied automatically in the SMS pipeline or on-demand via REST API.

---

## Overview

The Translation Engine rewrites SMS fields (`sender_id`, `destination`, `message`) **after routing** and **before dispatch**. Rules are regular-expression–based, scoped (global, per-client, per-supplier, per-route), and priority-ordered.

Key capabilities:

- **Sender ID masking** — dynamic pools, static overrides, or regex transforms
- **Content replacement** — text substitution, OTP extraction, emoji stripping
- **Destination formatting** — strip prefixes, normalize E.164, inject country codes
- **Pool modes** — pipe-separated random selection for anti-template-detection
- **Bulk import** — CSV or newline-delimited pool values
- **Automatic application** — integrated into `POST /api/sms/send` (step 4.5)

---

## Translation Types

| Type | Field Modified | Use Case |
|------|---------------|----------|
| `sender_id` | `sender_id` (from) | Mask the originator to appear from a different shortcode/name |
| `destination` | `destination` (to) | Strip prefixes, normalize formats, inject routing digits |
| `content` | `message` (text body) | Replace keywords, strip formatting, clean content |
| `origination` | `message` | Like `content` but also fires during translation previews |

All four types are matched simultaneously — a single SMS pass runs **every active matching rule** against all three fields.

---

## Subtypes & Pool Modes

### Static Subtypes

| Subtype | Behavior |
|---------|----------|
| `content_text_replacement` | Literal regex replace (target_value used as-is) |
| `destination_formatting` | Same as static — regex replace on destination |
| `sender_id_masking` | **Pool mode** — pipe-separated random pick |
| `content_random_body` | **Pool mode** — pipe-separated random pick |

### Pool Mode Details

When `subtype` is `sender_id_masking` or `content_random_body`, the `target_value` is interpreted as a **pipe-separated pool**. A random element is chosen at replacement time:

```
target_value = "SID_ALPHA|SID_BETA|SID_GAMMA"
source_pattern = ".*"

Input:  sender_id = "ORIGINAL"
Output: sender_id = "SID_BETA"   (randomly chosen)
```

Pool values are trimmed and empty entries are excluded. Single-value pools are treated as static replacements.

---

## Scoping & Priority

Rules are scoped using these columns:

| Column | Description |
|--------|-------------|
| `client_id` | `NULL` = global; set to a client ID for per-client rules |
| `supplier_id` | `NULL` = global; set for per-supplier rules |
| `route_id` | `NULL` = global; set for per-route rules |
| `apply_to` | `'client'` or `'supplier'` — legacy compatibility field |
| `apply_entity_id` | Entity ID or `'all'` |

**A rule matches** when ALL three scope columns (`client_id`, `supplier_id`, `route_id`) are either `NULL` (global) OR match the current SMS context. A rule scoped to client #5 + supplier #3 will only fire for SMS from client #5 routed through supplier #3.

Rules execute in `priority ASC, id ASC` order. Lower priority numbers run first.

---

## SMS Pipeline Integration

Translations apply automatically during `POST /api/sms/send` at **step 4.5** — after routing has selected a supplier but before the SMS is dispatched. The translated values (`sender_id`, `destination`, `message`) are what land in `sms_logs`.

```
Client SMS → Route Selection → [Translation Engine] → Supplier Dispatch → sms_logs
```

If the translation engine DB query fails, the pipeline **does not block** — the original values pass through unchanged.

---

## REST API Endpoints

### Apply Translations (Preview / Manual)

```
POST /api/translations/apply
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "client_id": 1,
  "supplier_id": 2,
  "route_id": null,
  "sender_id": "MY_SENDER",
  "destination": "00491234567890",
  "message": "Your OTP is 123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sender_id": "MASKED_SID",
    "destination": "491234567890",
    "message": "Your code is 123456",
    "applied": [
      { "id": 5, "type": "sender_id", "subtype": "sender_id_masking", "rule": ".*" },
      { "id": 8, "type": "content", "subtype": "content_text_replacement", "rule": "OTP" }
    ],
    "applied_count": 2
  }
}
```

### Create Translation Rule

```
POST /api/translations
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "translation_type": "sender_id",
  "source_pattern": ".*",
  "target_value": "SID_A|SID_B|SID_C",
  "subtype": "sender_id_masking",
  "priority": 1,
  "name": "SID Pool - Campaign Q4",
  "description": "Rotating sender IDs for anti-filtering",
  "apply_to": "client",
  "apply_entity_id": "all",
  "client_id": 1,
  "supplier_id": null,
  "route_id": null
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `translation_type` | string | Yes | `sender_id`, `destination`, `content`, or `origination` |
| `source_pattern` | string | Yes | JavaScript regex pattern (e.g. `.*`, `^00`, `\\d{4}$`) |
| `target_value` | string | Yes | Replacement string or pipe-separated pool |
| `subtype` | string | No | `sender_id_masking`, `content_random_body`, `content_text_replacement`, `destination_formatting` |
| `priority` | integer | No | Lower runs first. Default: 1 |
| `name` | string | No | Human-readable label |
| `description` | string | No | Notes for the rule |
| `apply_to` | string | No | `'client'` or `'supplier'` — legacy compat |
| `apply_entity_id` | string | No | Entity ID or `'all'` — legacy compat |
| `client_id` | integer | No | Scope to a specific client |
| `supplier_id` | integer | No | Scope to a specific supplier |
| `route_id` | integer | No | Scope to a specific route |

### Test a Pattern

```
POST /api/translations/test
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "source_pattern": "OTP",
  "target_value": "CODE",
  "test_input": "Your OTP is 123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "input": "Your OTP is 123456",
    "output": "Your CODE is 123456",
    "matches": true
  }
}
```

### List All Rules

```
POST /api/translations/list
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "sender_id",
  "entity_type": "client"
}
```

Returns up to 500 rules, ordered by ID. Filter by `type` (`sender_id`, `destination`, `content`, `origination`) or `entity_type` (`client`, `supplier`, `route`).

### Bulk Upload

```
POST /api/translations/bulk
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

file: <pool_values.txt or rules.csv>
type: sender_id_masking
apply_to: client
apply_entity_id: all
```

**Two modes:**

#### 1. Pool Mode (`sender_id_masking` / `content_random_body`)
Upload a **newline-delimited text file** — each line becomes a pool value. All values are joined with `|` into a single translation rule with pattern `.*`.

```
SID_CAMPAIGN_01
SID_CAMPAIGN_02
SID_CAMPAIGN_03
```

**Response:**
```json
{
  "success": true,
  "mode": "pool",
  "created": 1,
  "values_count": 3,
  "values": ["SID_CAMPAIGN_01", "SID_CAMPAIGN_02", "SID_CAMPAIGN_03"]
}
```

#### 2. CSV Mode (general)
Upload a CSV with header row. Auto-detects delimiter (comma, tab, semicolon, pipe).

```
name,type,pattern,replacement,priority,description
Strip +,sender_id,^\\+,,"1","Remove leading +"
Clean OTP,content,OTP,CODE,2,Replace OTP keyword
```

Each row creates one translation rule.

---

## Usage Examples

### Example 1: Sender ID Masking (Pool)

Create a rule that randomly replaces every sender_id with one of three values:

```
POST /api/translations
{
  "translation_type": "sender_id",
  "source_pattern": ".*",
  "target_value": "ALPHA|BRAVO|CHARLIE",
  "subtype": "sender_id_masking",
  "priority": 1
}
```

Every SMS sent will have its `sender_id` changed to `ALPHA`, `BRAVO`, or `CHARLIE` at random.

### Example 2: Content Text Replacement

Replace the word "OTP" with "CODE" in all messages:

```
POST /api/translations
{
  "translation_type": "content",
  "source_pattern": "OTP",
  "target_value": "CODE",
  "subtype": "content_text_replacement",
  "priority": 2
}
```

### Example 3: Destination Formatting (Strip Leading Zeros)

Strip international dialing prefix from German numbers:

```
POST /api/translations
{
  "translation_type": "destination",
  "source_pattern": "^00",
  "target_value": "",
  "subtype": "destination_formatting",
  "priority": 1
}
```

`00491234567890` → `491234567890`

### Example 4: Combined Rules

Create both a SID mask and a content replacement. They apply simultaneously in priority order:

```
# Rule 1 (priority=1): Mask sender_id
POST /api/translations
{
  "translation_type": "sender_id",
  "source_pattern": ".*",
  "target_value": "SIMUL_SID_A|SIMUL_SID_B|SIMUL_SID_C",
  "subtype": "sender_id_masking",
  "priority": 1
}

# Rule 2 (priority=2): Replace content keyword
POST /api/translations
{
  "translation_type": "content",
  "source_pattern": "SIMUL_TEST",
  "target_value": "SIMUL_TRANSFORMED",
  "subtype": "content_text_replacement",
  "priority": 2
}
```

A single SMS with `sender_id="ANY_SENDER"` and `message="SIMUL_TEST combined message"` will have both transformations applied: sender_id randomly picked from the pool, message text replaced.

### Example 5: Per-Client Scoping

Create a rule that only applies to client #3:

```
POST /api/translations
{
  "translation_type": "sender_id",
  "source_pattern": ".*",
  "target_value": "CLIENT3_BRANDED",
  "subtype": "sender_id_masking",
  "client_id": 3,
  "priority": 1
}
```

### Example 6: Bulk Pool Import

Upload a file with one SID per line:

```bash
curl -X POST http://localhost:3000/api/translations/bulk \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@sids.txt" \
  -F "type=sender_id_masking" \
  -F "apply_to=client" \
  -F "apply_entity_id=all"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/sms/send                                     │
│                                                         │
│  1. Auth client                                         │
│  2. Route plan check                                    │
│  3. MCC/MNC lookup from destination                     │
│  4. Route map selection → supplier                      │
│  4.5. [Translation Engine] ←── applies here             │
│       │                                                 │
│       ├── SELECT * FROM translations                    │
│       │   WHERE type IN (sender_id, destination,        │
│       │     content, origination)                       │
│       │   AND (client_id IS NULL OR client_id=?)        │
│       │   AND (supplier_id IS NULL OR supplier_id=?)    │
│       │   AND (route_id IS NULL OR route_id=?)          │
│       │   AND is_active = true                          │
│       │   ORDER BY priority ASC, id ASC                 │
│       │                                                 │
│       ├── For each rule:                                │
│       │   ├── pool mode? → pick random from |           │
│       │   ├── regex.test(field)? → replace              │
│       │   └── push to applied[]                         │
│       │                                                 │
│       └── Return { sender_id, destination, message }    │
│                                                         │
│  5. Rate lookup                                         │
│  6. Profit check                                        │
│  7. Balance check                                       │
│  8. INSERT sms_logs (with translated values)            │
│  9. Dispatch to supplier                                │
└─────────────────────────────────────────────────────────┘
```

The engine is **idempotent** — running `applyTranslations()` on the same inputs always produces the same output (even with random pools, since randomness is per-call, not cached). On **DB failure**, the engine returns inputs unchanged so SMS delivery is never blocked.

---

## Database Schema

```sql
CREATE TABLE translations (
    id SERIAL PRIMARY KEY,
    translation_type VARCHAR(50) NOT NULL,    -- sender_id | destination | content | origination
    source_pattern TEXT NOT NULL,              -- JavaScript regex
    target_value TEXT NOT NULL,                -- replacement or pipe-separated pool
    client_id INTEGER,                         -- NULL = global
    supplier_id INTEGER,                       -- NULL = global
    route_id INTEGER,                          -- NULL = global
    name VARCHAR(255),
    description TEXT,
    subtype VARCHAR(50),                       -- sender_id_masking | content_random_body | content_text_replacement | destination_formatting
    priority INTEGER DEFAULT 1,
    apply_to VARCHAR(20) DEFAULT 'client',     -- legacy compat
    apply_entity_id VARCHAR(50) DEFAULT 'all', -- legacy compat
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Best Practices

1. **Priority ordering matters.** Lower numbers run first. If two rules modify the same field, the first match wins for substitution order.

2. **Use specific patterns for targeted rules.** `.*` matches everything — useful for SID masking pools. Use targeted patterns (e.g. `^00`, `OTP`, `\\d{4}$`) for content and destination rules.

3. **Pool mode works with ANY pattern.** The pool is selected randomly, then applied via regex replace. For `sender_id_masking` with pattern `.*`, the entire sender_id is replaced. For targeted patterns, only the matched portion is replaced with the pool value.

4. **Scoping is AND logic.** A rule with `client_id=5 AND supplier_id=3` only matches SMS that has BOTH client #5 AND supplier #3. Use `NULL` for "any."

5. **Test before deploying.** Use `POST /api/translations/test` to verify regex patterns. Use `POST /api/translations/apply` to preview the combined effect of all rules before sending real SMS.

6. **Bulk import for large pools.** The pool-mode bulk upload creates a single translation rule with all values pipe-separated. For CSV mode, each row creates a separate rule.

---

## Related Files

| File | Purpose |
|------|---------|
| `apiExtensions.cjs` | Translation engine implementation (`applyTranslations()`, API endpoints) |
| `src/pages/Translations.tsx` | Frontend: CRUD table, create/edit forms, bulk upload, live preview |
| `src/services/translationPipeline.test.ts` | Vitest tests: pool mode, content replace, destination format, combined rules |
| `src/database/schema.sql` | `translations` table definition |
