# NET2APP Hub — REST API Reference

> Complete HTTP API documentation for the NET2APP Hub enterprise SMS platform.
> Base URL: `http://localhost:3000` (dev) or `https://your-domain.com` (production)

---

## Authentication

### JWT (Admin Panel)

All `/api/*` endpoints (except login and public webhooks) require a JWT Bearer token:

```
Authorization: Bearer <jwt_token>
```

Obtain a token via `POST /api/auth/login`. Tokens expire after 24 hours.

### API Keys (External Clients)

External API endpoints (`/api/v1/*`) accept an API key:

```
X-API-Key: n2a_<hex>
```

Or Basic Auth:

```
Authorization: Basic base64(smpp_username:smpp_password)
```

API keys are generated per client via `POST /api/clients/:id/api-key`.

### Internal Token (Java Gateway)

Internal endpoints (`/internal/*`) are called by the Java SMPP gateway. Optional shared secret:

```
X-Internal-Token: <INTERNAL_TOKEN env var>
```

### Role-Based Access

| Role | Access Level |
|------|-------------|
| `super_admin` | Full access — all CRUD, system config, delete/restore |
| `admin` | CRUD clients/suppliers/routes/rates, no system config |
| `support` | View + bind management + SMS testing |
| `billing` | Rates, invoices, payments |
| `agent` | Limited read access |
| `client` | Own CDR only |
| `supplier` | Own CDR only |

---

## Auth Endpoints

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@net2app.com",
    "role": "super_admin",
    "is_active": true,
    "last_login": "2026-07-01T10:00:00Z"
  }
}
```

### Current User
```
GET /api/auth/me
Authorization: Bearer <jwt>
```

Returns the authenticated user's profile (password_hash excluded).

---

## Clients

### List Clients
```
GET /api/clients
Authorization: Bearer <jwt>
```

Returns all non-deleted clients, ordered by `created_at DESC`.

### Create Client
```
POST /api/clients
Authorization: Bearer <jwt>  (super_admin, admin)

{
  "client_code": "CLT001",
  "company_name": "TechCorp Inc.",
  "email": "sms@techcorp.com",
  "smpp_username": "techcorp_smpp",
  "smpp_password": "secure_password",
  "billing_mode": "dlr",
  "currency": "EUR",
  "balance": 500.00,
  "credit_limit": 1000.00
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `client_code` | required | Unique client identifier |
| `company_name` | required | Display name |
| `email` | required | Contact email |
| `smpp_username` | required | SMPP system_id for ESME binds |
| `smpp_password` | required | SMPP password (bcrypt-hashed) |
| `billing_mode` | `dlr` | `dlr` (charge on delivery) or `submit` (charge on send) |
| `currency` | `EUR` | Billing currency |
| `balance` | `0` | Prepaid balance |
| `credit_limit` | `0` | Credit line |

### Update Client
```
PUT /api/clients/:id
Authorization: Bearer <jwt>  (super_admin, admin)

{ "status": "suspended", "max_tps": 50 }
```

Pass only the fields you want to update.

### Delete Client (Soft)
```
DELETE /api/clients/:id
Authorization: Bearer <jwt>  (super_admin)
```

Sets `is_deleted = true`, `status = 'inactive'`. Preserved in DB for audit/CDR.

### Restore Client
```
POST /api/clients/:id/restore
Authorization: Bearer <jwt>  (super_admin)
```

Sets `is_deleted = false`, `status = 'active'`.

### Generate API Key
```
POST /api/clients/:id/api-key
Authorization: Bearer <jwt>  (super_admin, admin)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "api_key": "n2a_3f8a9b2c...",
    "prefix": "n2a_3f8a9b",
    "message": "Save this key — it won't be shown again"
  }
}
```

### List API Keys
```
GET /api/clients/:id/api-keys
Authorization: Bearer <jwt>
```

Returns all API keys for a client (key hash, prefix, usage stats, active state).

### Revoke API Key
```
DELETE /api/api-keys/:id
Authorization: Bearer <jwt>  (super_admin, admin)
```

---

## Suppliers

### List Suppliers
```
GET /api/suppliers
Authorization: Bearer <jwt>
```

### Create Supplier
```
POST /api/suppliers
Authorization: Bearer <jwt>  (super_admin, admin)

{
  "supplier_code": "SUP001",
  "company_name": "GlobalSMS Ltd.",
  "connection_type": "smpp",
  "smpp_host": "smpp.globalsms.com",
  "smpp_port": 2775,
  "smpp_username": "globalsms_user",
  "smpp_password": "globalsms_pass"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `connection_type` | `smpp` | `smpp`, `http`, `ott_whatsapp`, `ott_telegram`, `voice_otp`, `rcs`, `flash_sms`, `local_bypass` |

### Update Supplier
```
PUT /api/suppliers/:id
Authorization: Bearer <jwt>  (super_admin, admin)
```

### Delete Supplier (Soft)
```
DELETE /api/suppliers/:id
Authorization: Bearer <jwt>  (super_admin)
```

### Restore Supplier
```
POST /api/suppliers/:id/restore
Authorization: Bearer <jwt>  (super_admin)
```

---

## SMS

### Send SMS
```
POST /api/sms/send
Authorization: Bearer <jwt>

{
  "client_id": 1,
  "destination": "+1234567890",
  "sender_id": "TECHCORP",
  "message": "Your verification code is 123456",
  "route_plan_id": 1
}
```

**Pipeline:** Auth → Route plan → MCC/MNC lookup → Supplier selection → Translation engine → Rate + profit check → Balance check → Channel validation → `sms_logs` INSERT → Dispatch.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 15001,
    "message_id": "MSG1719845678001",
    "client_id": 1,
    "client_code": "TC-MSG",
    "supplier_id": 3,
    "supplier_code": "GLOBALSMS",
    "sender_id": "MASKED_SID",
    "destination": "1234567890",
    "message": "Your code is 123456",
    "message_parts": 1,
    "client_rate": 0.025,
    "supplier_rate": 0.015,
    "profit": 0.01,
    "currency": "EUR",
    "status": "submitted",
    "route_id": 1,
    "route_name": "Premium OTP"
  }
}
```

**Error codes:**
| HTTP | Code | Description |
|------|------|-------------|
| 400 | — | Client not found or inactive |
| 400 | — | Route plan is mandatory |
| 400 | — | ROUTE BLOCKED: No profit (client rate ≤ supplier rate) |
| 402 | — | Insufficient balance/credit |
| 422 | — | rejected_no_channel: destination not reachable via selected channel |

### Query SMS Logs
```
POST /api/sms/logs
Authorization: Bearer <jwt>

{
  "client_id": 1,
  "status": "delivered",
  "dlr_status": "DELIVRD",
  "limit": 100,
  "offset": 0
}
```

Filters: `client_id`, `status` (`submitted`, `delivered`, `failed`, `expired`, `rejected`), `dlr_status` (`DELIVRD`, `UNDELIV`, `EXPIRED`, `REJECTD`), `limit`, `offset`.

### Validate SMS
```
POST /api/sms/validate
Authorization: Bearer <jwt>

{
  "client_id": 1,
  "destination": "+491234567890",
  "message": "Test message"
}
```

Returns routing preview: estimated cost, selected supplier, MCC/MNC, profit check, balance available. Does NOT send.

### Test SMS
```
POST /api/sms/test
Authorization: Bearer <jwt>

{
  "client_id": 1,
  "destination": "+1234567890",
  "sender_id": "TEST",
  "message": "Test message"
}
```

Inserts a `pending` row into `sms_logs` without dispatching. For UI testing only.

### Batch DLR Check
```
POST /api/sms/dlr/batch
Authorization: Bearer <jwt>

{
  "message_ids": ["MSG001", "MSG002", "MSG003"]
}
```

Returns DLR status for multiple message IDs in a single call.

---

## Bind Status

### All Bind Statuses
```
GET /api/bind/status
Authorization: Bearer <jwt>
```

Returns suppliers with their SMPP session status (`bound`, `unbound`, `error`), connected_at, last_activity, negotiated version, IP address, and last error.

### Client Bind Statuses
```
GET /api/bind/client-status
Authorization: Bearer <jwt>
```

Returns client-side SMPP session statuses from `smpp_sessions`.

### Single Supplier Bind Status
```
GET /api/bind/status/:id
Authorization: Bearer <jwt>
```

### Connect (Bind) Supplier
```
POST /api/bind/:id/connect
Authorization: Bearer <jwt>  (super_admin, admin, support)
```

Delegates to Java SMPP gateway. Auto-negotiates SMPP v5.0 → v3.4 → v3.3. Returns negotiated version on success.

### Disconnect Supplier
```
POST /api/bind/:id/disconnect
Authorization: Bearer <jwt>  (super_admin, admin, support)
```

Tears down the SMPP session via Java gateway.

### Disconnect Client ESME
```
POST /api/bind/client/:id/disconnect
Authorization: Bearer <jwt>  (super_admin, admin, support)
```

Looks up the active `smpp_session_id` for a client and force-disconnects via Java gateway.

### Reconnect Supplier
```
POST /api/bind/:id/reconnect
Authorization: Bearer <jwt>  (super_admin, admin, support)
```

Disconnects then re-binds the supplier. Resets failure counters.

### Test SMPP Connection
```
POST /api/bind/test
Authorization: Bearer <jwt>

{
  "host": "smpp.supplier.com",
  "port": 2775,
  "username": "test_user",
  "password": "test_pass",
  "interface_version": 52
}
```

Performs a one-shot bind test via Java gateway and immediately unbinds. Does not persist state.

---

## Rates

### List Rates
```
GET /api/rates?entity_type=client&entity_id=1
Authorization: Bearer <jwt>
```

### Create Rate
```
POST /api/rates
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "entity_type": "client",
  "entity_id": 1,
  "mcc": "310",
  "mnc": "260",
  "country": "United States",
  "operator": "T-Mobile",
  "rate": 0.025
}
```

Auto-deactivates any existing active rate for the same entity+mcc+mnc (versioning).

### Bulk Create Rates
```
POST /api/rates/bulk
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "rates": [
    { "entity_type": "client", "entity_id": 1, "mcc": "310", "mnc": "260", "rate": 0.025 },
    { "entity_type": "client", "entity_id": 1, "mcc": "310", "mnc": "410", "rate": 0.030 }
  ]
}
```

### Update Rate (Smart Versioning)
```
PUT /api/rates/:id
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{ "rate": 0.030, "is_active": true }
```

- **Rate value change** → deactivates old rate, inserts new version (audit trail)
- **is_active toggle** → in-place update (no new version)

### Rate History
```
GET /api/rates/history?entity_type=client&entity_id=1&mcc=310
Authorization: Bearer <jwt>
```

Returns all versions (active + deactivated) for audit trail.

### Deactivate Old Rates
```
POST /api/rates/deactivate-old
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "rates": [
    { "entity_type": "client", "entity_id": 1, "mcc": "310", "mnc": "260" }
  ]
}
```

### Rate Destination Lookup
```
GET /api/rates/destination?entity_type=client&entity_id=1&mcc=310
Authorization: Bearer <jwt>
```

Returns all MNC rates for a given entity + MCC.

### Update Destination Rates
```
POST /api/rates/update-destination
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "entity_type": "client",
  "entity_id": 1,
  "mcc": "310",
  "new_rate": 0.028,
  "mnc_list": ["260", "410"],
  "send_notification": true
}
```

Updates all MNCs under one MCC in a single transaction.

### Rate Change Notification
```
POST /api/rates/notify
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "entity_type": "client",
  "entity_id": 1,
  "rate_ids": [10, 11],
  "destination": "United States",
  "old_rate": 0.025,
  "new_rate": 0.030,
  "effective_date": "2026-07-15"
}
```

Records a notification and sends an email (if SMTP configured).

---

## Billing

### List Invoices
```
GET /api/billing/invoices
Authorization: Bearer <jwt>
```

Returns last 50 invoices.

### Generate Invoice
```
POST /api/invoices/generate
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "entity_type": "client",
  "entity_id": 1,
  "period_start": "2026-06-01",
  "period_end": "2026-06-30",
  "notes": "June 2026 invoice"
}
```

Auto-calculates: SMS count, total amount, 19% tax, grand total. Due date: +30 days.

### Get Invoice
```
GET /api/invoices/:id
Authorization: Bearer <jwt>
```

### Invoice Breakdown
```
GET /api/invoices/:id/breakdown
Authorization: Bearer <jwt>
```

Returns by-MCC and by-day breakdown arrays.

### Send Invoice
```
POST /api/invoices/:id/send
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "additional_emails": ["billing@client.com"]
}
```

### Mark Invoice Paid
```
POST /api/invoices/:id/mark-paid
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "payment_method": "bank_transfer",
  "reference": "INV-2026-001"
}
```

Creates payment record AND credits client/supplier balance — all in one transaction.

### Invoice PDF
```
GET /api/invoices/:id/pdf
Authorization: Bearer <jwt>
```

Returns a generated PDF invoice.

### Bulk Generate Invoices
```
POST /api/invoices/bulk-generate
Authorization: Bearer <jwt>  (super_admin, admin, billing)

{
  "entity_type": "client",
  "entity_ids": [1, 2, 3],
  "period_start": "2026-06-01",
  "period_end": "2026-06-30"
}
```

### Payments

```
POST   /api/payments              # Create payment
GET    /api/payments/history      # Payment history (requires entity_type + entity_id)
POST   /api/payments/list         # Query with filters (entity_type, status, date range)
PUT    /api/payments/:id/status   # Update payment status
```

---

## Voice OTP

### Send Voice OTP
```
POST /api/voice-otp/send
Authorization: Bearer <jwt>

{
  "destination": "+491234567890",
  "otp_code": "123456",
  "language": "de-DE",
  "client_id": 1,
  "max_retries": 1
}
```

**Language auto-detection:** When `language` is omitted, the system matches the destination prefix against `voice_otp_configs.country_prefix` (tries 4→3→2→1 digits). Falls back to `en-US`.

**Response:**
```json
{
  "success": true,
  "data": {
    "call_id": "VOC1719845678001",
    "destination": "+491234567890",
    "status": "initiated",
    "max_retries": 1,
    "dial_queued": true,
    "routed_to_server_id": 1,
    "routed_to_server_name": "ams01"
  }
}
```

**Retry protocol:** 2 attempts maximum (initial + 1 retry). First retry waits 60 seconds. Uses primary audio files on first attempt, secondary audio files on retry.

### Get Call Status
```
GET /api/voice-otp/calls/:call_id
Authorization: Bearer <jwt>
```

### Query Call Logs
```
POST /api/voice-otp/logs
Authorization: Bearer <jwt>

{
  "date_from": "2026-06-01",
  "date_to": "2026-06-30",
  "status": "completed",
  "language": "de-DE"
}
```

### Test Voice OTP
```
POST /api/voice-otp/test
Authorization: Bearer <jwt>

{
  "destination": "+1234567890",
  "language": "en-US"
}
```

Simulates a call (inserts completed log row, no actual dial).

### Voice OTP Languages
```
GET /api/voice-otp/languages
Authorization: Bearer <jwt>
```

Returns all 31 supported languages from `languages.cjs` with country codes.

### Voice OTP Configs
```
GET    /api/voice-otp/configs              # List all language configs
PUT    /api/voice-otp/configs/:id          # Update one config
POST   /api/voice-otp/seed-defaults        # Idempotent seed of country groups
```

Config includes: language, country_prefix, greeting/retry texts, audio files, SIP settings.

### Audio Upload
```
POST /api/voice-otp/audio-upload
Authorization: Bearer <jwt>  (super_admin, admin, support)
Content-Type: multipart/form-data

audio: <file.mp3 or file.wav>
language_code: de-DE
digit: 1
flavor: primary          # primary | secondary
group_id: 5              # optional
```

Converts to 8kHz mono WAV via ffmpeg. Digit can be `0-9` or `greeting`.

### Audio Metadata
```
GET /api/voice-otp/audio-meta/:lang
Authorization: Bearer <jwt>
```

### Manual Retry
```
POST /api/voice-otp/retry-now
Authorization: Bearer <jwt>  (super_admin, admin, support)

{
  "call_id": "VOC1719845678001"
}
```

### Retry Queue
```
GET /api/voice-otp/retry-queue
Authorization: Bearer <jwt>
```

### Active Calls
```
GET /api/voice-otp/active-calls
Authorization: Bearer <jwt>
```

---

## Translations

> Full documentation: [TRANSLATIONS.md](TRANSLATIONS.md)

```
POST   /api/translations            # Create rule
POST   /api/translations/apply      # Preview/manual apply
POST   /api/translations/test       # Test regex pattern
POST   /api/translations/list       # List rules (with filters)
POST   /api/translations/bulk       # Bulk upload (pool or CSV)
```

Translation types: `sender_id` | `destination` | `content` | `origination`
Pool subtypes: `sender_id_masking` | `content_random_body` (pipe-separated random pick)
Static subtypes: `content_text_replacement` | `destination_formatting`

---

## Asterisk / SIP

### SIP Servers

```
GET    /api/asterisk/servers                    # List all servers
POST   /api/asterisk/servers                    # Create server
PUT    /api/asterisk/servers/:id                # Update server
DELETE /api/asterisk/servers/:id                # Archive (soft-delete)
POST   /api/asterisk/servers/:id/test           # Health probe (TCP + AMI login)
```

### Fleet Health

```
GET /api/asterisk/health
Authorization: Bearer <jwt>
```

Returns `{ ok, total, up, down, results[], tips[], severity_counts{} }`. Tips are structured diagnostic items with severity, message, and actionable fix instructions.

### Routing Decision
```
GET /api/asterisk/routing-decision?destination=+1234567890&strategy=priority
Authorization: Bearer <jwt>
```

### Destination Patterns (SIP routing)

```
GET    /api/asterisk/destinations                 # List patterns
GET    /api/asterisk/servers/:id/destinations     # Per-server patterns
POST   /api/asterisk/servers/:id/destinations     # Create pattern
PUT    /api/asterisk/destinations/:id             # Update pattern
DELETE /api/asterisk/destinations/:id             # Archive pattern
POST   /api/asterisk/destinations/test            # Compile + test regex
GET    /api/asterisk/destinations/preview         # "Which server for this dest?"
```

### DLR Push Test
```
POST /api/asterisk/dlr-push-test
Authorization: Bearer <jwt>  (super_admin, admin, support)

{
  "client_id": 1,
  "message_id": "SMOKE_DLR_001",
  "dlr_status": "DELIVRD",
  "destination": "+10000000000"
}
```

### Legacy Settings
```
GET    /api/asterisk/settings          # Legacy asterisk_settings
PUT    /api/asterisk/settings          # Update settings
POST   /api/asterisk/install           # Install Asterisk + write manager.conf
POST   /api/asterisk/regenerate-config # Regenerate pjsip.conf, extensions.conf, etc.
POST   /api/asterisk/originate         # Manual AMI originate
POST   /api/asterisk/post-install-checklist  # Pre-install readiness checks
```

---

## Notifications

### Send Notification
```
POST /api/notifications/send
Authorization: Bearer <jwt>

{
  "template_name": "low_balance",
  "recipients": ["admin@net2app.com"],
  "variables": { "balance": "50.00", "threshold": "100.00" }
}
```

Sends email (if SMTP configured) + posts to Teams/Slack (if configured).

### List Notifications
```
POST /api/notifications/list
Authorization: Bearer <jwt>

{
  "type": "error",
  "read": false,
  "all_users": true
}
```

Admins see all; non-admins see notifications scoped to their role or email.

### Mark Read
```
POST /api/notifications/:id/read
POST /api/notifications/read-all
Authorization: Bearer <jwt>
```

### Specialized Notifications
```
POST /api/notifications/rate-change     # Rate change alert + email
POST /api/notifications/low-balance     # Low balance warning
POST /api/notifications/dlr-failure     # DLR failure alert
```

---

## Teams / Slack

### Teams
```
GET    /api/teams/config        # Get Teams webhook config
PUT    /api/teams/config        # Update config
POST   /api/teams/test          # Test webhook
POST   /api/teams/send          # Send text message
```

### Slack
```
GET    /api/slack/config        # Get Slack webhook config
PUT    /api/slack/config        # Update config
POST   /api/slack/test          # Test webhook
POST   /api/slack/send          # Send text message
```

---

## Number Validation

```
GET    /api/number/validate?destination=+1234567890&channel=whatsapp
POST   /api/number/validate-all                # Check all channels
GET    /api/number/validation-cache             # Query cached results
GET    /api/number/providers                    # List providers
PUT    /api/number/providers/:channel           # Update provider config
```

---

## System

### Dashboard Stats
```
GET /api/dashboard/stats
Authorization: Bearer <jwt>
```

Returns: total/active clients, total/active suppliers, today's SMS count, today's delivered count, bound suppliers count.

### Schema Migrations
```
POST   /api/system/run-migrations       # Trigger idempotent migrations
GET    /api/system/migration-status     # List applied migration hashes
```

### SMTP Test
```
POST /api/smtp/test
Authorization: Bearer <jwt>  (super_admin, admin)
```

---

## WhatsApp & Telegram

### Send WhatsApp
```
POST /api/whatsapp/send
Authorization: Bearer <jwt>

{
  "to": "1234567890",
  "text": "Hello from WhatsApp!",
  "client_id": 1,
  "supplier_id": 5
}
```

### Send Telegram
```
POST /api/telegram/send
Authorization: Bearer <jwt>

{
  "to": "123456789",
  "text": "Hello from Telegram!",
  "client_id": 1
}
```

### Inbound Webhooks (public, no JWT)
```
GET    /api/webhooks/whatsapp            # Meta verification (hub.mode=subscribe)
POST   /api/webhooks/whatsapp            # Incoming WhatsApp messages
POST   /api/webhooks/telegram            # Incoming Telegram messages
POST   /api/webhooks/dlr/:connector_id   # Connector DLR callbacks
```

---

## Social API Pairing

```
POST   /api/social-suppliers/:id/pair               # Start pairing session
GET    /api/social-suppliers/:id/pair-status         # Poll pairing status
POST   /api/social-suppliers/:id/pair-verify         # Submit phone/code (Telegram)
POST   /api/social-suppliers/:id/pair-cancel         # Cancel pairing
```

---

## API Connectors

```
POST   /api/api-connectors/:id/test      # Test HTTP connector
POST   /api/api-connectors/:id/send      # Send SMS via HTTP connector
```

---

## MO SMS (Inbound)

```
GET    /api/mo_sms                       # List inbound messages (supports channel filter)
POST   /api/mo_sms/reply                 # Reply to inbound message
```

---

## Users

```
GET    /api/users                        # List users
POST   /api/users                        # Create user
PUT    /api/users/:id                    # Update user
DELETE /api/users/:id                    # Delete user
```

---

## SMPP Sessions

```
GET /api/smpp_sessions
Authorization: Bearer <jwt>
```

Returns all active/inactive SMPP sessions.

---

## Generic CRUD

For tables not covered by explicit endpoints, a generic CRUD loop provides:

```
GET    /api/:table             # List all rows
GET    /api/:table/:id         # Get single row
POST   /api/:table             # Insert row
PUT    /api/:table/:id         # Update row
DELETE /api/:table/:id         # Delete row
```

---

## Internal API (Java Gateway)

These endpoints are called ONLY by the Java SMPP gateway. Protected by `X-Internal-Token` (optional).

```
POST /internal/esme_auth               # Authenticate ESME bind (client or inbound supplier)
POST /internal/esme_bind_event         # Record bind lifecycle event → smpp_sessions
POST /internal/dlr_event               # Receive DLR from gateway → sms_logs + billing
POST /internal/esme_delivery_lookup    # Lookup webhook_url and ESME session for DLR push
GET  /internal/suppliers/active_outbound  # Fetch active outbound SMPP suppliers for auto-bind
```

---

## External API (Client-Facing v1)

Documented in [API_DOCUMENTATION.md](API_DOCUMENTATION.md):

```
POST /api/v1/sms/send                   # Send SMS
POST /api/v1/sms/bulk                   # Bulk SMS
GET  /api/v1/sms/dlr/:message_id        # Check DLR
GET  /api/v1/account/balance            # Check balance
POST /api/v1/supplier/sms/receive       # Supplier: receive SMS for delivery
POST /api/v1/supplier/dlr/submit        # Supplier: submit DLR
GET  /api/v1/supplier/account/balance   # Supplier: balance inquiry
```

---

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | — | Missing/invalid parameters, route blocked, channel reject |
| 401 | — | Invalid token, wrong credentials |
| 402 | — | Insufficient balance/credit |
| 403 | — | Role forbidden, inactive account |
| 404 | — | Resource not found |
| 409 | — | Conflict (e.g. invoice already paid) |
| 422 | — | rejected_no_channel |
| 429 | — | Rate limited |
| 500 | — | Internal server error |
| 502 | — | Connector/gateway unreachable |
| 503 | — | Service not configured (e.g. Asterisk bridge missing) |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/auth/login` | Per-IP rate limit |
| `/api/sms/send` | Per-client TPS limit |
| `/api/sms/logs` | 100 rows default, max 500 |
| Bulk endpoints | 5 MB multipart upload |

---

## Quick Reference

```
# Auth
POST   /api/auth/login
GET    /api/auth/me

# Clients
GET    /api/clients
POST   /api/clients
PUT    /api/clients/:id
DELETE /api/clients/:id          (super_admin — soft delete)
POST   /api/clients/:id/restore  (super_admin)
POST   /api/clients/:id/api-key

# Suppliers
GET    /api/suppliers
POST   /api/suppliers
PUT    /api/suppliers/:id
DELETE /api/suppliers/:id        (super_admin — soft delete)
POST   /api/suppliers/:id/restore (super_admin)

# SMS
POST   /api/sms/send
POST   /api/sms/logs
POST   /api/sms/validate
POST   /api/sms/test
POST   /api/sms/dlr/batch

# Bind
GET    /api/bind/status
GET    /api/bind/client-status
GET    /api/bind/status/:id
POST   /api/bind/:id/connect
POST   /api/bind/:id/disconnect
POST   /api/bind/client/:id/disconnect
POST   /api/bind/:id/reconnect
POST   /api/bind/test

# Rates
GET    /api/rates
POST   /api/rates
POST   /api/rates/bulk
PUT    /api/rates/:id
GET    /api/rates/history
POST   /api/rates/deactivate-old
POST   /api/rates/notify
GET    /api/rates/destination
POST   /api/rates/update-destination

# Billing
GET    /api/billing/invoices
POST   /api/invoices/generate
GET    /api/invoices/:id
GET    /api/invoices/:id/breakdown
POST   /api/invoices/:id/send
POST   /api/invoices/:id/mark-paid
GET    /api/invoices/:id/pdf
POST   /api/invoices/bulk-generate
POST   /api/payments
GET    /api/payments/history
POST   /api/payments/list
PUT    /api/payments/:id/status

# Voice OTP
POST   /api/voice-otp/send
GET    /api/voice-otp/calls/:call_id
POST   /api/voice-otp/logs
POST   /api/voice-otp/test
GET    /api/voice-otp/languages
GET    /api/voice-otp/configs
PUT    /api/voice-otp/configs/:id
POST   /api/voice-otp/seed-defaults
POST   /api/voice-otp/audio-upload
GET    /api/voice-otp/audio-meta/:lang
POST   /api/voice-otp/retry-now
GET    /api/voice-otp/retry-queue
GET    /api/voice-otp/active-calls

# Translations
POST   /api/translations
POST   /api/translations/apply
POST   /api/translations/test
POST   /api/translations/list
POST   /api/translations/bulk

# Asterisk / SIP
GET    /api/asterisk/servers
POST   /api/asterisk/servers
PUT    /api/asterisk/servers/:id
DELETE /api/asterisk/servers/:id
POST   /api/asterisk/servers/:id/test
GET    /api/asterisk/health
GET    /api/asterisk/routing-decision
GET    /api/asterisk/destinations
GET    /api/asterisk/servers/:id/destinations
POST   /api/asterisk/servers/:id/destinations
PUT    /api/asterisk/destinations/:id
DELETE /api/asterisk/destinations/:id
POST   /api/asterisk/destinations/test
GET    /api/asterisk/destinations/preview
POST   /api/asterisk/dlr-push-test
GET    /api/asterisk/settings
PUT    /api/asterisk/settings
POST   /api/asterisk/install
POST   /api/asterisk/regenerate-config
POST   /api/asterisk/originate
GET    /api/asterisk/post-install-checklist

# Notifications
POST   /api/notifications/send
POST   /api/notifications/list
POST   /api/notifications/:id/read
POST   /api/notifications/read-all
POST   /api/notifications/rate-change
POST   /api/notifications/low-balance
POST   /api/notifications/dlr-failure

# Teams / Slack
GET    /api/teams/config
PUT    /api/teams/config
POST   /api/teams/test
POST   /api/teams/send
GET    /api/slack/config
PUT    /api/slack/config
POST   /api/slack/test
POST   /api/slack/send

# WhatsApp / Telegram
POST   /api/whatsapp/send
POST   /api/telegram/send
GET    /api/webhooks/whatsapp
POST   /api/webhooks/whatsapp
POST   /api/webhooks/telegram
POST   /api/webhooks/dlr/:connector_id

# Social Pairing
POST   /api/social-suppliers/:id/pair
GET    /api/social-suppliers/:id/pair-status
POST   /api/social-suppliers/:id/pair-verify
POST   /api/social-suppliers/:id/pair-cancel

# Number Validation
GET    /api/number/validate
POST   /api/number/validate-all
GET    /api/number/validation-cache
GET    /api/number/providers
PUT    /api/number/providers/:channel

# System
GET    /api/dashboard/stats
POST   /api/system/run-migrations
GET    /api/system/migration-status
POST   /api/smtp/test

# MO SMS
GET    /api/mo_sms
POST   /api/mo_sms/reply

# Users
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id

# API Keys
DELETE /api/api-keys/:id

# SMPP Sessions
GET    /api/smpp_sessions
```
