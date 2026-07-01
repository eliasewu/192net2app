# NET2APP Hub — Enterprise SMS Platform v3.0

> Multi-channel SMS broker & middleware — SMPP, WhatsApp, Telegram, Voice OTP, Email, HTTP API.  
> Client accounts, supplier gateways, dynamic LCR routing, license-tier billing, DLR tracking.

---

## Features

| Module | Capabilities |
|--------|-------------|
| **SMS Engine** | SMPP v3.3/v3.4/v5.0 auto-negotiation, HTTP API connectors, bulk SMS, scheduled delivery |
| **Multi-Channel** | SMS (SMPP/HTTP), WhatsApp Cloud API, Telegram Bot API, Voice OTP, Email (SMTP), RCS |
| **Routing** | LCR / Priority / Percentage routing, route plans, trunks, MCCMNC pattern matching |
| **Billing** | DLR-mode & submit-mode billing, auto-invoicing, credit limits, profit checks |
| **DLR Tracking** | Real-time delivery receipts, webhook callbacks, SMPP delivery_sm push-back |
| **Clients** | SMPP client accounts, API keys, webhook URLs, per-client TPS & quota limits |
| **Suppliers** | SMPP, HTTP, OTT, Voice bind management, auto-reconnect, failure tracking |
| **Numbers** | 2740+ MCC/MNC database, number validation, destination prefix routing |
| **Notifications** | Email (SMTP), Slack webhooks, Microsoft Teams webhooks, alert templates |
| **Users & Roles** | 7-tier RBAC: Super Admin → Admin → Support → Billing → Agent → Client → Supplier |
| **Licensing** | Tiered license (Trial → 50M Volume), feature flags, tenant monitoring |
| **Asterisk/SIP** | Voice OTP dialer, AMI integration, multi-server failover, call retry queue |
| **Reporting** | Real-time / hourly / daily / monthly CDR, revenue/cost/profit charts |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React 19 SPA (Vite 8 + Tailwind v4 + Recharts)         │
│  src/ — 56 pages, 12 shared UI components                │
│  Port :5173 (dev) → proxied to :3000                     │
└──────────────────────┬───────────────────────────────────┘
                       │ REST API (JWT Bearer)
┌──────────────────────▼───────────────────────────────────┐
│  Node Express Server (server.cjs)                        │
│  Port :3000 — JWT auth, CRUD, SMS pipeline, DLR          │
│  Bridges: gateway-bridge, asterisk-bridge, emailService  │
└──────────────────────┬───────────────────────────────────┘
                       │ pg (node-postgres)
┌──────────────────────▼───────────────────────────────────┐
│  PostgreSQL :5432 — database: sms_platform                │
│  26 tables, 30+ indexes, triggers, functions             │
└──────────────────────────────────────────────────────────┘

External services:
┌──────────────────────────────────────────────────────────┐
│  Java 21 SMPP Gateway (smpp-gateway/)                    │
│  Android SMS Gateway (android-sms-gateway/)              │
│  WhatsApp Cloud API  •  Telegram Bot API                 │
│  Asterisk AMI (Voice OTP)  •  SMTP (Email)               │
└──────────────────────────────────────────────────────────┘
```

---

## Quick Start (local dev)

```sh
# 1. Clone
git clone https://github.com/eliasewu/192net2app.git
cd 192net2app

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Set up PostgreSQL
#    Create database and user:
#    CREATE USER sms_user WITH PASSWORD 'SmsPlatform2024Secure';
#    CREATE DATABASE sms_platform OWNER sms_user;
psql -h localhost -U sms_user -d sms_platform -f src/database/schema.sql

# 4. Load seed data (optional — MCCMNC database, sample clients/suppliers)
psql -h localhost -U sms_user -d sms_platform -f database_data.sql

# 5. Start backend
node server.cjs          # → http://localhost:3000

# 6. Start frontend (separate terminal)
npm run dev              # → http://localhost:5173

# 7. Login
#    Username: admin    Password: admin123
```

---

## Production Deployment

### Prerequisites
- **Node.js 22+** (matches Vite 8 engine range)
- **PostgreSQL 16** (running on :5432)
- **Java 21** (for SMPP gateway — optional if not using SMPP)
- **nginx** (reverse proxy + static file serving)

### Deploy Steps

```sh
# 1. Clone and install
git clone https://github.com/eliasewu/192net2app.git /opt/net2app-hub
cd /opt/net2app-hub
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env   # or create .env with your settings
# Required vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET

# 3. Load database
psql -h localhost -U sms_user -d sms_platform -f src/database/schema.sql
psql -h localhost -U sms_user -d sms_platform -f database_data.sql

# 4. Build frontend
npm run build           # → dist/

# 5. Configure nginx (see DEPLOY_HTTPS.md)
#    Reverse proxy /api/* → localhost:3000
#    Serve dist/ as static files

# 6. Set up systemd services (scripts/systemd/)
sudo cp scripts/systemd/net2app-hub.service /etc/systemd/system/
sudo cp scripts/systemd/net2app-sgw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now net2app-hub net2app-sgw

# 7. Set up health check (optional)
sudo cp scripts/systemd/net2app-hub-healthcheck.service /etc/systemd/system/
sudo cp scripts/systemd/net2app-hub-healthcheck.timer /etc/systemd/system/
sudo systemctl enable --now net2app-hub-healthcheck.timer
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Express server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `sms_platform` | Database name |
| `DB_USER` | `sms_user` | Database user |
| `DB_PASSWORD` | `SmsPlatform2024Secure` | Database password |
| `JWT_SECRET` | (auto-generated) | JWT signing secret |
| `INTERNAL_TOKEN` | (none) | Internal API auth token |
| `PROXY_REGISTER_SECRET` | `net2app-proxy-2024` | Residential proxy auth |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite 8, React 19, TypeScript 5.9, Tailwind CSS v4, Recharts, React Router 7 |
| **Backend** | Node.js, Express 5, JWT auth, bcrypt, express-rate-limit |
| **Database** | PostgreSQL 16, node-postgres (pg), 26 tables, triggers, functions |
| **SMPP Gateway** | Java 21 (smpp-gateway/), SMPP v3.3/v3.4/v5.0 auto-negotiation |
| **Android GW** | Android SMS Gateway (android-sms-gateway/), SMPP client on device |
| **Voice OTP** | Asterisk AMI integration, SIP, multi-server failover, call retry |
| **Messaging** | WhatsApp Cloud API v21.0, Telegram Bot API, SOCKS5 proxy support |
| **Email** | Nodemailer, SMTP, notification templates with variable substitution |
| **Testing** | Vitest 4, Testing Library, jsdom |
| **CI/CD** | GitHub Actions (.github/workflows/ci.yml) — vitest + tsc + smoke |

---

## Documentation Index

| File | Description |
|------|-------------|
| [HOW_TO.md](HOW_TO.md) | Sidebar-menu tutorial — step-by-step walkthrough of every feature, common workflows, first-time setup |
| [REST_API.md](REST_API.md) | Complete REST API reference — all endpoints, auth, error codes, quick-reference |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | External client API — send SMS, DLR, balance, code examples (cURL, Python, PHP, Node.js) |
| [TRANSLATIONS.md](TRANSLATIONS.md) | Translation engine — SID masking, content replacement, destination formatting, pool modes, bulk upload |
| [SMS_FLOW_AND_DATABASE_SCHEMA.md](SMS_FLOW_AND_DATABASE_SCHEMA.md) | SMS pipeline end-to-end + 26-table PostgreSQL schema |
| [UI_FLOW.md](UI_FLOW.md) | Complete UI flow — 56 pages, navigation tree, component patterns |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, typechecking, tests, pre-commit hook, CI details |
| [DEPLOY_HTTPS.md](DEPLOY_HTTPS.md) | Production deploy with nginx + Let's Encrypt HTTPS |
| [UPDATE_FRONTEND.md](UPDATE_FRONTEND.md) | Historical migration log (localStorage → API) |

---

## Repository Structure

```
.
├── server.cjs                    # Main Express server (:3000)
├── external-api.cjs              # External API auth (API keys, Basic Auth)
├── users-api.cjs                 # /api/users CRUD
├── apiExtensions.cjs             # Asterisk, number validation, email endpoints
├── gateway-bridge.cjs            # Node ↔ Java SMPP gateway bridge
├── asterisk-bridge.cjs           # Asterisk AMI integration
├── emailService.cjs              # Email/SMTP service
├── slackService.cjs              # Slack webhook integration
├── teamsService.cjs              # Teams webhook integration
├── number-validation-providers.cjs  # Phone number validation
├── social-pairing.cjs            # WhatsApp/Telegram device pairing
│
├── src/                          # React + TypeScript frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Router + providers
│   ├── components/               # Shared UI (Card, Table, Modal, Button, etc.)
│   │   ├── UI/                   # 12 reusable components
│   │   └── Layout/               # Header, Sidebar, MainLayout
│   ├── pages/                    # 56 route-driven pages
│   │   ├── Dashboard.tsx
│   │   ├── Clients/              # List, Add, Detail, Rates
│   │   ├── Suppliers/            # List, Add, Detail, Rates, API, OTT, Voice, Email
│   │   ├── Routing/              # Trunks, Routes, Maps, Plans
│   │   ├── Rates/                # Management, Bulk Upload, MCCMNC DB
│   │   ├── Billing/              # Overview, Invoices, Payments
│   │   ├── Notifications/        # Alerts, Templates, Slack, Teams
│   │   ├── System/               # Settings, License, DB, Backup, Asterisk
│   │   └── ...                   # SMS Logs, Inbox, Campaigns, Users, Testing
│   ├── services/                 # api.ts, exportService, supplierBindHelper
│   ├── store/                    # DataContext, AuthContext
│   ├── database/                 # schema.sql, postgresql.ts, apiEndpoints.ts
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # smsHelpers + tests
│
├── src/database/
│   ├── schema.sql                # Full PostgreSQL schema (26 tables)
│   └── multi_channel_migrations.sql
│
├── database_data.sql             # Seed data (MCCMNC, clients, suppliers, etc.)
├── database_full.sql             # Complete database dump
│
├── smpp-gateway/                 # Java 21 SMPP gateway (Maven)
├── android-sms-gateway/          # Android SMS gateway app (Gradle)
│
├── scripts/
│   ├── systemd/                  # Systemd service & timer files
│   ├── logrotate/                # Log rotation config
│   └── pre-commit                # Git pre-commit hook
│
├── .github/workflows/ci.yml     # CI pipeline (vitest + tsc + smoke)
│
└── *.md                          # Documentation
```

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Super Admin |
| `support` | `support123` | Support |
| `billing` | `billing123` | Billing |
| `techcorp_user` | `techcorp123` | Client |
| `globalsms_user` | `globalsms123` | Supplier |

> **Change these immediately in production.** Passwords are bcrypt-hashed on first boot.

---

## Running Tests

```sh
npm test                    # Vitest (unit tests)
npm run test:watch          # Watch mode
npm run verify              # Full pipeline: tests + typecheck + backend smoke
bash scripts/smoke.sh       # Backend CRUD smoke test against live DB

# Type-checking
npx tsc --noEmit                           # Frontend
npx tsc --noEmit -p tsconfig.node.json     # Vite/Vitest config
```

---

## API Quick Reference

```
POST   /api/auth/login              # Login → JWT token
GET    /api/auth/me                 # Current user profile

GET    /api/clients                 # List clients
POST   /api/clients                 # Create client
PUT    /api/clients/:id             # Update client
DELETE /api/clients/:id             # Delete client (Super Admin only)
POST   /api/clients/:id/api-key     # Generate API key

GET    /api/suppliers               # List suppliers
POST   /api/suppliers               # Create supplier
PUT    /api/suppliers/:id           # Update supplier

POST   /api/sms/send                # Send SMS (with routing + billing)
POST   /api/sms/logs                # Query SMS logs

GET    /api/bind/status             # All bind statuses
POST   /api/bind/:id/connect        # Connect SMPP supplier
POST   /api/bind/:id/disconnect     # Disconnect SMPP supplier
POST   /api/bind/test               # Test SMPP connection

POST   /api/whatsapp/send           # Send WhatsApp message
POST   /api/telegram/send           # Send Telegram message

GET    /api/dashboard/stats         # Dashboard KPIs
GET    /api/rates                   # Rate management
GET    /api/billing/invoices        # Invoice list
POST   /api/billing/invoices        # Generate invoice

# Generic CRUD (auto-generated for all tables)
GET/POST/PUT/DELETE  /api/:table    # routes, trunks, campaigns, mccmnc, etc.
```

Full API documentation → [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

---

## License

Proprietary — NET2APP Technologies. See [LICENSE](LICENSE) file for terms.

---

**Need help?** Check [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, [DEPLOY_HTTPS.md](DEPLOY_HTTPS.md) for production deployment, or [UI_FLOW.md](UI_FLOW.md) for the complete UI reference.
