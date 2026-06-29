# NET2APP Hub — UI Flow Documentation

> Enterprise SMS Platform • React + React Router • Tailwind CSS

---

## 1. Application Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        App.tsx (Router)                          │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐  │
│  │   Public Routes  │    │         Protected Routes            │  │
│  │                  │    │  (MainLayout → Sidebar + Header)    │  │
│  │  /landing        │    │                                     │  │
│  │  /login          │    │  All authenticated pages render     │  │
│  │                  │    │  inside <Outlet /> of MainLayout    │  │
│  └─────────────────┘    └─────────────────────────────────────┘  │
│                                                                  │
│  Providers: AuthProvider → DataProvider → ToastProvider           │
│  Global:    BackendStatusBanner (mounted at root)                │
└──────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
Landing Page (/landing)
    │
    ├── "Sign In" ──────► Login (/login)
    │                         │
    │                         ├── Valid credentials ──► / (Dashboard)
    │                         │
    │                         └── Invalid ──► Error message shown
    │
    └── "Get Started Free" ──► Login (/login)

ProtectedRoute Guard:
    • Checks `isAuthenticated` from AuthContext
    • Shows spinner while `isLoading` is true
    • Redirects to /login if not authenticated

PublicRoute Guard:
    • Redirects to / (Dashboard) if already authenticated
    • Prevents logged-in users from seeing login/landing
```

---

## 2. Main Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Header (fixed top)                                           │
│ ┌────────┬─────────────────────┬─────────────────────────┐   │
│ │ Toggle │ Search              │ Stats │ Theme │ 🔔 │ 👤  │   │
│ │ Sidebar│ "Search clients..." │ Today │ Moon  │Notif│Menu │   │
│ └────────┴─────────────────────┴─────────────────────────┘   │
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │ Main Content Area                                 │
│ (fixed   │ ┌─────────────────────────────────────────────┐  │
│  left,   │ │                                             │  │
│  256px)  │ │           <Outlet /> renders page            │  │
│          │ │                                             │  │
│ 📡 NET2APP│ │                                             │  │
│ ─────────│ │                                             │  │
│ 📊 Dash  │ │                                             │  │
│ 👥Clients│ │                                             │  │
│ 🏢Suppliers│ │                                           │  │
│ 🔀Routing│ │                                             │  │
│ 💲Rates  │ │                                             │  │
│ 💳Billing│ │                                             │  │
│ 📩SMS Log│ │                                             │  │
│ 📩SMS Inb│ │                                             │  │
│ 📊Reports│ │                                             │  │
│ 📢Campaign│ │                                            │  │
│ 🔴Bind   │ │                                             │  │
│ 🛡Number │ │                                             │  │
│ 📧Email  │ │                                             │  │
│ 🧪Testing│ │                                             │  │
│ 🌐Transl │ │                                             │  │
│ 🔔Notifs │ │                                             │  │
│ 👤Users  │ │                                             │  │
│ ⚙️System │ │                                             │  │
│          │ └─────────────────────────────────────────────┘  │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 3. Complete Route Map

### Public Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/landing` | `LandingPage` | Marketing page with features, pricing (Stripe/Piprapay), demo request form |
| `/login` | `Login` | Username/password authentication form |

### Dashboard
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Dashboard` | KPI stat cards, alert panel, hourly traffic chart, revenue/cost chart, top destinations pie chart, recent SMS list, low-balance clients |

### Clients Module
| Path | Component | Description |
|------|-----------|-------------|
| `/clients` | `ClientsList` | Table with search, status filter, CSV/Excel export. Row click → detail. Actions: View, Edit, Delete |
| `/clients/add` | `AddClient` | Form to create new client with SMPP credentials, balance, credit limit, routing plan |
| `/clients/:id` | `ClientDetail` | Client overview with stats, invoices, payments, usage |
| `/clients/:id/edit` | `AddClient` | Edit form (reuses AddClient) |
| `/clients/rates` | `ClientRates` | Rate table per client with add/edit/delete modals |

**Client Detail Sub-flow:**
```
ClientsList
  ├── Click row ──► ClientDetail (/clients/:id)
  │                    ├── Overview tab
  │                    ├── SMPP Bind tab
  │                    ├── Invoices tab
  │                    ├── Payments tab
  │                    └── Usage tab
  ├── ⋮ menu → Edit ──► AddClient (/clients/:id/edit)
  ├── ⋮ menu → Delete ──► Confirm modal → delete
  └── "Add Client" ──► AddClient (/clients/add)
```

### Suppliers Module
| Path | Component | Description |
|------|-----------|-------------|
| `/suppliers` | `SuppliersList` | Table with search, status/type filter, CSV import. Shows bind status, failures, balance |
| `/suppliers/add` | `AddSupplier` | Multi-step form: SMPP / HTTP / Email / OTT / Voice connection types |
| `/suppliers/:id` | `SupplierDetail` | Supplier overview, bind info, traffic stats |
| `/suppliers/:id/edit` | `AddSupplier` | Edit form (reuses AddSupplier) |
| `/suppliers/rates` | `SupplierRates` | Rate table per supplier |
| `/suppliers/api-connectors` | `APIConnectors` | Pre-built connectors for Twilio, Vonage, Infobip, etc. |
| `/suppliers/ott-devices` | `OTTDevices` | WhatsApp, Telegram device management |
| `/suppliers/voice-otp` | `VoiceOTP` | Voice OTP provider configuration |
| `/suppliers/social-api` | `SocialAPISuppliers` | WhatsApp/Telegram API suppliers |
| `/suppliers/email` | `EmailSuppliers` | Email supplier management |
| `/suppliers/email/smtp` | `SmtpConfig` | SMTP server configuration |

**Supplier Detail Sub-flow:**
```
SuppliersList
  ├── Click row ──► SupplierDetail (/suppliers/:id)
  │                    ├── Overview tab
  │                    ├── SMPP Bind tab
  │                    ├── Traffic tab
  │                    └── Logs tab
  ├── ⋮ menu → Edit ──► AddSupplier (/suppliers/:id/edit)
  ├── ⋮ menu → Delete ──► Confirm modal → delete
  ├── "Import CSV" ──► Import modal (browse/paste CSV)
  └── "Add Supplier" ──► AddSupplier (/suppliers/add)
```

### Routing Module
| Path | Component | Description |
|------|-----------|-------------|
| `/routing/trunks` | `TrunksList` | Trunk configs with type, supplier, priority, percentage, MCCMNC. IP modal per trunk |
| `/routing/routes` | `RoutesList` | Route definitions with LCR/priority/percentage methods |
| `/routing/maps` | `RouteMaps` | Visual route mapping between clients and suppliers |
| `/routing/plans` | `RoutePlans` | Route plan grouping — assign multiple routes to a plan |

**Routing Relationships:**
```
Suppliers
    │
    ▼
Trunks (type, priority, %, MCCMNC filter)
    │
    ▼
Routes (LCR / Priority / Percentage)
    │
    ▼
Route Maps (client ↔ route binding)
    │
    ▼
Route Plans (group of routes)
    │
    ▼
Clients (assigned route plan)
```

### Rates Module
| Path | Component | Description |
|------|-----------|-------------|
| `/rates` | `RateManagement` | Client/Supplier rate tabs. Filter by increase/decrease/unchanged/new. Bulk update modal |
| `/rates/upload` | `BulkUpload` | CSV import for rates, MCCMNC, clients, suppliers |
| `/rates/mccmnc` | `MCCMNCDatabase` | Full MCC/MNC database with 2740+ entries, search, country/operator filters |

**Rate Change Tracking:**
```
RateManagement
  ├── Tab: Client Rates | Supplier Rates
  ├── Filter buttons: All | ↑ Increase | ↓ Decrease | → Same | ★ New
  ├── "Add Rate" ──► Modal (entity type, MCC/MNC, rate, effective dates)
  ├── "Bulk Update" ──► CSV paste modal
  ├── Row click → Edit modal (auto-deactivates old rate, creates new version)
  └── Export CSV / Excel
```

### Billing Module
| Path | Component | Description |
|------|-----------|-------------|
| `/billing` | `BillingOverview` | Revenue, cost, profit, outstanding. Bar chart by month |
| `/billing/invoices` | `InvoicesList` | Invoice list with status badges (draft/sent/paid/overdue), mark paid |
| `/billing/payments` | `PaymentsPage` | Payment history table with search |

### SMS Logs
| Path | Component | Description |
|------|-----------|-------------|
| `/sms-logs` | `SMSLogs` | Full CDR table (auto-refreshes every 10s). Columns: Message ID, Client, Sender, Destination, Route, Status, DLR Result, DLR Response Time, Duration, Rates, Time. Detail modal with Overview + SMPP PDU tabs |

**SMS Log Detail Flow:**
```
SMSLogs
  └── Click row / Eye icon ──► Detail Modal
        ├── Tab: Overview
        │    ├── Delivery Status (send result, deliver result, charged parts)
        │    ├── Message Content + byte count
        │    ├── Destinations & Routing (destination, sender, client, supplier)
        │    ├── Routing (route, trunk, channel, source)
        │    ├── Timing (created, submit, deliver, DLR timestamps, durations)
        │    ├── Financial (client rate, supplier rate, profit, parts)
        │    └── SMPP/Technical (message IDs, ESM class, data coding, error)
        │
        └── Tab: SMPP PDU
             ├── Submit SM PDU (command_id 0x04, all PDU fields)
             └── Deliver SM PDU (command_id 0x05, DLR receipt)
```

### SMS Inbox (MO)
| Path | Component | Description |
|------|-----------|-------------|
| `/sms-inbox` | `SMSInbox` | Mobile-originated (inbound) SMS management |

### Reports Module
| Path | Component | Description |
|------|-----------|-------------|
| `/reports/realtime` | `RealtimeReport` | Live traffic chart (60-minute window), delivery rate, active clients |
| `/reports/hourly` | `HourlyReport` | 24-hour breakdown table with success % |
| `/reports/daily` | `DailyReport` | Last 20 days with revenue, cost, profit |
| `/reports/monthly` | `MonthlyReport` | Monthly summary with margin % |

### Campaigns
| Path | Component | Description |
|------|-----------|-------------|
| `/campaigns` | `CampaignsPage` | Campaign list with progress bars, DLR %, status (draft/running/completed), play/pause actions |

### Bind Status
| Path | Component | Description |
|------|-----------|-------------|
| `/bind-status` | `BindStatus` | Real-time bind status for all SMPP supplier connections |

### Number Validation
| Path | Component | Description |
|------|-----------|-------------|
| `/number-validation` | `NumberValidation` | Phone number validation and formatting tools |

### IP List
| Path | Component | Description |
|------|-----------|-------------|
| `/ip-list` | `IPList` | IP whitelist/blacklist management per trunk |

### Email Module
| Path | Component | Description |
|------|-----------|-------------|
| `/suppliers/email/smtp` | `SmtpConfig` | SMTP server configuration (host, port, encryption, credentials) |
| `/suppliers/email` | `EmailSuppliers` | Email supplier accounts |

### Testing Module
| Path | Component | Description |
|------|-----------|-------------|
| `/testing/sms` | `TestSMS` | Send test SMS to verify end-to-end flow |
| `/testing/smpp` | `TestSMPPBind` | Real SMPP bind test via Java 21 gateway (auto-negotiates v5.0→v3.4→v3.3) |
| `/testing/http` | `TestHTTPAPI` | Simulated HTTP API request builder |

### Translations
| Path | Component | Description |
|------|-----------|-------------|
| `/translations` | `TranslationsPage` | Multi-language SMS template management |

### Notifications Module
| Path | Component | Description |
|------|-----------|-------------|
| `/notifications/alerts` | `AlertsPage` | Computed alerts: DLR failures, low balance, channel disconnects, invoices, payments |
| `/notifications/templates` | `EmailTemplates` | Email template management |
| `/notifications/teams` | `TeamsConfig` | Microsoft Teams webhook integration |
| `/notifications/slack` | `SlackConfig` | Slack webhook integration |

### Users Module
| Path | Component | Description |
|------|-----------|-------------|
| `/users` | `UserManagement` | User CRUD (load from PostgreSQL), role assignment, active/inactive toggle |
| `/users/roles` | `RolesPage` | 7 role definitions with permissions badges |

**Role Hierarchy:**
```
Super Admin → Admin → Support → Billing → Agent → Client → Supplier
     │           │         │         │        │        │         │
   Full      Manage    View/     Invoice   Limited  Own CDR  Own CDR
   Access    clients   manage    payments  access   only     only
             suppliers SMS logs
             routes
```

### System Module
| Path | Component | Description |
|------|-----------|-------------|
| `/system/settings` | `PlatformSettings` | Platform name, support email, currency, SMTP settings |
| `/system/license` | `License` | License key management and validation |
| `/system/database` | `DatabasePage` | Live PostgreSQL table stats (row counts, sizes) |
| `/system/backup` | `BackupPage` | Backup file listing, download, restore actions |
| `/system/asterisk` | `AsteriskConfig` | Asterisk/SIP server configuration |
| `/system/asterisk-destinations` | `SipDestinations` | SIP destination management |

### Business API Connect
| Path | Component | Description |
|------|-----------|-------------|
| `/business-api-connect` | `BusinessAPIConnect` | Third-party API integration configuration |

---

## 4. Global UI Elements

### Header Bar (persistent across all protected routes)
```
┌────────────────────────────────────────────────────────────┐
│ ☰ (toggle sidebar)  │  🔍 Search  │  📊 Stats │ 🌙 🔔 👤 │
│                      │  "Search     │  Today SMS│      │   │
│                      │  clients..." │  Binds    │  Notif   │
│                      │              │  Del Rate │  UserMenu│
└────────────────────────────────────────────────────────────┘

Stats shown: Today's SMS count | Active Binds (bound/total) | Delivery Rate %
Notifications dropdown: unread count badge, last 5 notifications
User menu: Profile, Settings, Logout
```

### BackendStatusBanner
- Mounted globally at app root
- Shows sticky red banner when backend is unreachable (502/upstream error)
- Returns null when backend is healthy

### Sidebar Behavior
- Collapsible (256px → 64px) with smooth transition
- Animated submenu expand/collapse (measures content height)
- Auto-expands parent menus when child route is active
- Active item: blue highlight with left accent dot
- Scrollbar: thin, themed to match dark sidebar
- Logo: 📡 NET2APP Hub (collapses to just emoji)

---

## 5. Data Flow

```
┌─────────────────────────────────────────────────┐
│                  DataContext                     │
│                                                  │
│  Fetches all data on mount via api.ts:           │
│  ├── GET /clients         → clients[]            │
│  ├── GET /suppliers       → suppliers[]          │
│  ├── GET /sms-logs        → smsLogs[]            │
│  ├── GET /trunks          → trunks[]             │
│  ├── GET /routes          → routes[]             │
│  ├── GET /route-maps      → routeMaps[]          │
│  ├── GET /route-plans     → routePlans[]         │
│  ├── GET /rates           → rates[]              │
│  ├── GET /invoices        → invoices[]           │
│  ├── GET /payments        → payments[]           │
│  ├── GET /mccmnc          → mccmnc[]             │
│  ├── GET /campaigns       → campaigns[]          │
│  ├── GET /notifications   → notifications[]      │
│  ├── GET /users           → users[]              │
│  ├── GET /platform-settings → platformSettings   │
│  └── GET /smtp-config     → smtpConfig           │
│                                                  │
│  Provides CRUD methods:                          │
│  ├── addClient, updateClient, deleteClient       │
│  ├── addSupplier, updateSupplier, deleteSupplier │
│  ├── addTrunk, updateTrunk, deleteTrunk          │
│  ├── addRate, updateRate, deleteRate             │
│  └── ...                                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                  AuthContext                      │
│                                                  │
│  POST /auth/login → JWT token                    │
│  Stores token in localStorage                    │
│  Provides: isAuthenticated, isLoading, login,    │
│            logout, user, token                   │
└─────────────────────────────────────────────────┘
```

---

## 6. Shared UI Components

| Component | Used In | Purpose |
|-----------|---------|---------|
| `Card` | All pages | White rounded container with optional title/subtitle |
| `Table` | List pages | Generic sortable table with column definitions |
| `Pagination` | List pages | Page navigation with items per page |
| `Modal` | Forms, delete confirmations | Overlay dialog with footer actions |
| `Button` | Everywhere | Primary/secondary/danger/ghost variants, with icon support |
| `Badge` | Status indicators | success/warning/danger/info/purple/default variants, optional dot |
| `Input` | Forms | Labeled text input with error state |
| `Select` | Forms, filters | Labeled dropdown |
| `Textarea` | Bulk upload, templates | Multi-line text input |
| `StatCard` | Dashboard, overview pages | KPI card with icon, value, change indicator |
| `Toast` | Global | Success/error/info notification popups |
| `ErrorBoundary` | Login route | Catches render errors, shows fallback UI |
| `BackendStatusBanner` | Global | Sticky banner when backend is down |

---

## 7. Page Interaction Patterns

### Standard CRUD Pattern (Clients, Suppliers, Trunks, etc.)
```
List Page (Table + Search + Filters + Export)
  │
  ├── "Add" button ──► Add Form (Modal or full page)
  │                      └── Submit ──► Create API call ──► Toast success
  │
  ├── Row click ──► Detail Page
  │
  ├── ⋮ Actions menu per row:
  │    ├── "View" ──► Detail page
  │    ├── "Edit" ──► Edit Form (reuses Add form)
  │    └── "Delete" ──► Confirm Modal ──► Delete API call ──► Toast success
  │
  └── Export buttons: CSV / Excel
```

### Modal Pattern
```
Modal
  ├── Title
  ├── Body (form fields or content)
  └── Footer
       ├── "Cancel" ──► Close modal
       └── "Submit" ──► Action ──► Close modal + Toast
```

### Filter Pattern (applies to all list pages)
```
Search bar ──► Filters (status dropdown, type dropdown)
              └── Filtered results ──► Table ──► Pagination
```

### Export Pattern (applies to most pages)
```
"Export CSV" ──► exportCSV() ──► Download .csv file
"Export Excel" ──► exportExcel() ──► Download .xlsx file
```

---

## 8. Complete Navigation Tree

```
📡 NET2APP Hub
├── 📊 Dashboard (/)
├── 👥 Clients
│   ├── All Clients (/clients)
│   ├── Add Client (/clients/add)
│   └── Client Rates (/clients/rates)
├── 🏢 Suppliers
│   ├── All Suppliers (/suppliers)
│   ├── Add Supplier (/suppliers/add)
│   ├── Supplier Rates (/suppliers/rates)
│   ├── API Connectors (/suppliers/api-connectors)
│   ├── OTT Devices (/suppliers/ott-devices)
│   ├── Voice OTP (/suppliers/voice-otp)
│   └── Social API - WA/TG (/suppliers/social-api)
├── 🔀 Routing
│   ├── Trunks (/routing/trunks)
│   ├── Routes (/routing/routes)
│   ├── Route Maps (/routing/maps)
│   └── Route Plans (/routing/plans)
├── 💲 Rates
│   ├── Rate Management (/rates)
│   ├── Bulk Upload (/rates/upload)
│   └── MCC/MNC Database (/rates/mccmnc)
├── 💳 Billing
│   ├── Overview (/billing)
│   ├── Invoices (/billing/invoices)
│   └── Payments (/billing/payments)
├── 📩 SMS Logs (/sms-logs)
├── 📩 SMS Inbox - MO (/sms-inbox)
├── 📊 Reports
│   ├── Real-time (/reports/realtime)
│   ├── Hourly (/reports/hourly)
│   ├── Daily (/reports/daily)
│   └── Monthly (/reports/monthly)
├── 📢 Campaigns (/campaigns)
├── 🔴 Bind Status (/bind-status)
├── 🛡 Number Validation (/number-validation)
├── 📡 IP List (/ip-list)
├── 📧 Email
│   ├── SMTP Configuration (/suppliers/email/smtp)
│   └── Email Suppliers (/suppliers/email)
├── 🧪 Testing
│   ├── Test SMS (/testing/sms)
│   ├── Test SMPP Bind (/testing/smpp)
│   └── Test HTTP API (/testing/http)
├── 🌐 Translations (/translations)
├── 🔔 Notifications
│   ├── Alerts (/notifications/alerts)
│   ├── Email Templates (/notifications/templates)
│   ├── Teams Integration (/notifications/teams)
│   └── Slack Integration (/notifications/slack)
├── 👤 Users
│   ├── User Management (/users)
│   └── Roles & Permissions (/users/roles)
├── ⚙️ System
│   ├── Platform Settings (/system/settings)
│   ├── License (/system/license)
│   ├── Database (/system/database)
│   ├── Backup (/system/backup)
│   ├── Asterisk / SIP (/system/asterisk)
│   └── Server Destinations (/system/asterisk-destinations)
└── 🔗 Business API Connect (/business-api-connect)
```

---

## 9. Total Page Count

| Category | Pages | Count |
|----------|-------|-------|
| Public | Landing, Login | 2 |
| Dashboard | Dashboard | 1 |
| Clients | List, Add/Edit, Detail, Rates | 4 |
| Suppliers | List, Add/Edit, Detail, Rates, API Connectors, OTT Devices, Voice OTP, Social API, Email Suppliers, SMTP Config | 10 |
| Routing | Trunks, Routes, Route Maps, Route Plans | 4 |
| Rates | Management, Bulk Upload, MCC/MNC Database | 3 |
| Billing | Overview, Invoices, Payments | 3 |
| SMS | Logs, Inbox | 2 |
| Reports | Realtime, Hourly, Daily, Monthly | 4 |
| Campaigns | Campaigns | 1 |
| Monitoring | Bind Status, Number Validation, IP List | 3 |
| Email | SMTP Config, Email Suppliers | 2 |
| Testing | Test SMS, Test SMPP, Test HTTP | 3 |
| Translations | Translations | 1 |
| Notifications | Alerts, Email Templates, Teams, Slack | 4 |
| Users | User Management, Roles & Permissions | 2 |
| System | Settings, License, Database, Backup, Asterisk, SIP Destinations | 6 |
| Business | Business API Connect | 1 |
| **Total** | | **56** |
