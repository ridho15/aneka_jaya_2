# Aneka Jaya Internal App — Developer Handoff

**Prepared:** 2026-06-26  
**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · React Hook Form · Zod  
**Node required:** 18.17+

---

## 1. Quick Start

```bash
cd Aneka-Jaya
cp .env.example .env.local        # fill in tokens
npm install
npm run dev                       # http://localhost:3000
```

Default mode is `mock` — the full app is usable without any external service.

---

## 2. Directory Structure

```
Aneka-Jaya/
├── app/                          # Next.js App Router pages + API routes
│   ├── api/
│   │   ├── approval/[id]/        # Approve / reject a request
│   │   ├── expenses/             # POST pengeluaran
│   │   ├── jobs/                 # Cron job endpoints (CRON_SECRET protected)
│   │   │   ├── send-daily-report/
│   │   │   ├── send-tempo-reminder/
│   │   │   ├── check-stock-alert/
│   │   │   └── retry-erp-sync/
│   │   ├── products/             # GET list + GET/PUT single product (ERP)
│   │   ├── rekening/             # GET / POST / PUT rekening accounts
│   │   ├── sales/                # POST penjualan
│   │   ├── session/role/         # Role switcher (dev/demo only)
│   │   ├── stocks/               # GET stock levels (ERP)
│   │   ├── tempo/[id]/pay/       # POST tempo payment
│   │   ├── tipe/                 # GET / POST / PUT bookkeeping types
│   │   ├── upload/               # POST file upload (OpenCloud)
│   │   └── whatsapp/test/        # POST test WhatsApp message
│   ├── approval/                 # Approval list + detail pages
│   ├── audit-trail/              # Append-only audit log viewer
│   ├── barang/                   # Stock Barang list + input + edit
│   ├── dashboard/                # Owner-only KPI dashboard
│   ├── erp-sync/                 # ERP sync status (Owner only)
│   ├── no-access/                # Redirect target for unauthorized access
│   ├── pembelian/input/          # Input Pembelian
│   ├── pengeluaran/input/        # Input Pengeluaran
│   ├── penjualan/input/          # Input Penjualan
│   ├── reports/                  # Owner reports (daily report preview)
│   ├── reports/finance/          # Finance reports
│   ├── settings/                 # Settings hub (Owner only)
│   │   ├── rekening/             # Manage rekening accounts
│   │   ├── tipe/                 # Manage bookkeeping types
│   │   └── whatsapp/             # WhatsApp recipient management
│   ├── stok-barang/              # Alias for barang page
│   └── tempo/                    # Tempo list + detail/pay page
│
├── components/
│   ├── approval/ApprovalActionForm.tsx
│   ├── dashboard/                # KpiCard, PerformanceChart, CategoryChart
│   ├── forms/
│   │   ├── BarangForm.tsx
│   │   ├── PengeluaranForm.tsx   # ← accepts tipes/rekenings as props
│   │   └── PenjualanForm.tsx     # ← accepts tipes/rekenings as props
│   ├── layout/
│   │   ├── AppShell.tsx          # Layout wrapper (injects role)
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx           # Permission-filtered nav
│   ├── products/ProductList.tsx
│   ├── settings/
│   │   ├── RekeningManager.tsx   # Owner rekening CRUD UI
│   │   ├── RoleSelector.tsx      # Dev/demo role switcher
│   │   ├── TipeManager.tsx       # Owner tipe CRUD UI
│   │   └── WhatsAppTestButton.tsx
│   ├── stocks/StockList.tsx
│   ├── tempo/TempoPayForm.tsx    # ← accepts rekenings as props
│   └── ui/                       # Button, Input, Select, Toast, etc.
│
├── lib/
│   ├── api/
│   │   ├── anikaClient.ts        # Base HTTP client for ERP
│   │   ├── expenses.ts           # createExpense() — ERP + mock
│   │   ├── invoices.ts           # GET invoices adapter
│   │   ├── neo.ts                # sendNeoCommand() — Neo envelope
│   │   ├── products.ts           # listProducts(), updateProduct()
│   │   ├── sales.ts              # createSale() — ERP + mock
│   │   └── stocks.ts             # listStocks()
│   ├── approval/store.ts         # createApprovalRequest(), updateApprovalStatus()
│   ├── audit/store.ts            # recordAudit(), listAudit()
│   ├── auth/
│   │   ├── roles.ts              # ROLE_PERMISSIONS, can(), landingPageForRole()
│   │   └── session.ts            # getCurrentUser(), getCurrentRole()
│   ├── business/
│   │   └── masterData.ts         # Tipe + Rekening — persistent JSON store
│   ├── data/
│   │   └── jsonStore.ts          # readJsonArray() / writeJsonArray() — data layer
│   ├── jobs/cronAuth.ts          # rejectIfInvalidCron()
│   ├── mock/                     # In-memory mock data (sales, expenses, products, etc.)
│   ├── opencloud/                # File upload abstraction
│   ├── paymentAccounts.ts        # INDONESIAN_BANKS constant (used by RekeningManager)
│   ├── sales/store.ts            # listSalesRecords(), saveSalesRecord()
│   ├── stockAlerts/              # checkStockMinimumAlert(), scheduler
│   ├── tempo/store.ts            # createTempoReceivable(), payTempo(), list*
│   ├── types/                    # TypeScript types: api, expenses, product, sales, stock
│   ├── validation/               # Zod schemas: barang, pengeluaran, penjualan
│   └── whatsapp/
│       ├── providers/            # metaCloudApi, thirdPartyProvider, mockWhatsapp
│       ├── reportFormatter.ts    # formatDailyReport(), formatTempoReminderReport()
│       ├── reportScheduler.ts    # sendDailyReportJob(), etc.
│       ├── types.ts
│       └── whatsappClient.ts     # sendWhatsappMessage(), listWhatsappRecipients()
│
├── data/                         # PERSISTENT JSON storage (mount as volume in prod)
│   └── *.json                    # auto-created on first write
│
├── middleware.ts                 # Route-level permission guard
├── .env.example                  # All environment variables documented
├── Dockerfile
└── docker-compose.yml
```

---

## 3. Environment Variables

Copy `.env.example` → `.env.local` and fill in:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_APP_MODE` | `mock` or `production` | Yes |
| `APP_DEFAULT_ROLE` | Default role in dev (`OWNER`) | Dev only |
| `APP_ACTOR_ID` | Actor ID for session | Dev only |
| `APP_ACTOR_NAME` | Actor name for session | Dev only |
| `DATA_DIR` | Override path for JSON data files | Optional |
| `ANIKA_ERP_API_BASE_URL` | `https://ankjy.playgo.id/api/integrations` | Production |
| `ANIKA_ERP_API_TOKEN` | Bearer token — **server-side only, never expose** | Production |
| `OPENCLOUD_API_BASE_URL` | OpenCloud base URL | Production |
| `OPENCLOUD_PROJECT_ID` | OpenCloud project | Production |
| `OPENCLOUD_API_KEY` | **server-side only** | Production |
| `OPENCLOUD_STORAGE_BUCKET` | Storage bucket name | Production |
| `WHATSAPP_PROVIDER` | `mock` / `meta_cloud_api` / `third_party` | Yes |
| `WHATSAPP_CLOUD_API_TOKEN` | Meta token — **server-side only** | If meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID | If meta |
| `WHATSAPP_THIRD_PARTY_ENDPOINT` | Third-party API endpoint | If third_party |
| `WHATSAPP_THIRD_PARTY_TOKEN` | **server-side only** | If third_party |
| `CRON_SECRET` | Shared secret for `/api/jobs/*` — **change in production** | Yes |
| `REQUIRE_APPROVAL_PENJUALAN` | `true`/`false` | Optional |
| `REQUIRE_APPROVAL_PENGELUARAN` | `true`/`false` | Optional |

**Security rule:** Any variable without `NEXT_PUBLIC_` prefix is server-only. Never add API keys/tokens to `NEXT_PUBLIC_*` variables.

---

## 4. Role System

All permissions are in **`lib/auth/roles.ts`** — single source of truth.

### Roles and their default landing pages

| Role | Landing page | Can see Dashboard |
|------|-------------|-------------------|
| OWNER | `/dashboard` | Yes |
| ADMIN | `/penjualan/input` | **No** |
| FINANCE | `/tempo` | **No** |
| MANAGER | `/approval` | **No** |
| VIEWER | `/no-access` | No |

### Permission matrix (abbreviated)

| Permission | OWNER | ADMIN | FINANCE | MANAGER | VIEWER |
|-----------|-------|-------|---------|---------|--------|
| `dashboard.view` | ✓ | — | — | — | — |
| `penjualan.create` | ✓ | ✓ | — | — | — |
| `pengeluaran.create` | ✓ | ✓ | ✓ | — | — |
| `pembelian.create` | ✓ | — | ✓ | — | — |
| `stock.view` / `stock.create` | ✓ | ✓ | — | — | — |
| `reports.view` | ✓ | — | — | — | — |
| `reports.finance_view` | ✓ | — | ✓ | ✓ | — |
| `settings.view` | ✓ | — | — | — | — |
| `settings.tipe.manage` | ✓ | — | — | — | — |
| `settings.rekening.manage` | ✓ | — | — | — | — |
| `settings.whatsapp.manage` | ✓ | — | — | — | — |
| `approval.view` / `approval.approve` | ✓ | — | — | ✓ | — |
| `tempo.view` | ✓ | — | ✓ | ✓ | — |
| `tempo.mark_paid` / `tempo.cancel` | ✓ | — | ✓ | — | — |
| `tempo.write_off` | ✓ | — | — | — | — |
| `audit.view` | ✓ | — | — | ✓* | — |
| `erp_sync.retry` | ✓ | — | — | — | — |

\* Manager sees only approval-related audit entries.

### Checking permissions

```ts
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

// Server component / API route
const role = getCurrentRole();
if (!can(role, "dashboard.view")) redirect("/no-access");

// Client component (receive role as prop from server)
{can(role, "tempo.mark_paid") && <Button>Mark Paid</Button>}
```

---

## 5. Data Layer (JSON Store)

**File:** `lib/data/jsonStore.ts`

All persistent data is stored as JSON arrays in the `data/` directory.

```ts
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";

// Read
const rows = await readJsonArray<MyType>("my-file.json");

// Write (replaces entire file)
await writeJsonArray("my-file.json", rows);
```

### Data files

| File | Contents |
|------|----------|
| `audit-trail.json` | Append-only audit logs |
| `sales-records.json` | Sales transactions |
| `approval-requests.json` | Approval requests |
| `tempo-receivables.json` | Open/paid tempo piutang |
| `tempo-payments.json` | Tempo payment records |
| `whatsapp-recipients.json` | WhatsApp recipient config |
| `whatsapp-message-logs.json` | All WA send attempts |
| `stock-alert-logs.json` | Stock alert history |
| `bookkeeping-types.json` | Tipe pembukuan (Owner-managed) |
| `rekening-accounts.json` | Rekening bank (Owner-managed) |

**Production deployment:** mount `data/` as a persistent Docker volume. Without this, all data is lost on container restart.

---

## 6. Tipe Pembukuan & Rekening

### Tipe

A bookkeeping category that groups transactions (W, SLM, Online, etc.).

```ts
type BookkeepingType = {
  id: string;        // unique key
  code: string;      // display code (e.g. "W", "SLM")
  name: string;      // display name (may differ from code)
  isActive: boolean; // disabled tipe stays in history but hides from forms
  sortOrder: number;
};
```

**Rules:**
- Owner can add / edit / disable Tipe via `/settings/tipe`.
- **Never delete Tipe** if it has existing transactions. Use `isActive: false` instead.
- Every transaction stores `tipeId`, `tipeCodeSnapshot`, `tipeNameSnapshot` — so renaming Tipe never breaks old reports.

### Rekening

```ts
type RekeningAccount = {
  id: string;
  bank: string;
  name: string;
  accountNumber: string;
  isCash?: boolean;
  tipeIds: string[];   // many-to-many: which tipes use this rekening
};
```

**Rules:**
- Rekening is filtered by `tipeId` in all transaction forms.
- When Tipe changes in a form, Rekening dropdown auto-refreshes.
- One rekening can be assigned to multiple tipes.

### API endpoints

```
GET    /api/tipe              → list all types
POST   /api/tipe              → add new type (Owner only)
PUT    /api/tipe              → update/disable type (Owner only)

GET    /api/rekening          → list all rekening
GET    /api/rekening?tipeId=W → list rekening for a specific tipe
POST   /api/rekening          → add new rekening (Owner only)
PUT    /api/rekening          → update rekening (Owner only)
```

---

## 7. Audit Trail

**File:** `lib/audit/store.ts`

Every important action must call `recordAudit()`. The audit file is append-only — no delete or update from UI.

```ts
await recordAudit({
  entityType: "sales",     // or expense, tempo, approval, tipe, rekening, etc.
  entityId: sale.id,
  action: "create",        // or update, approve, reject, mark_paid, etc.
  afterValue: sale,        // optional snapshot of new state
  reason: "Invoice Penjualan · approved · Cash"
});
```

The function automatically adds `userId`, `userNameSnapshot`, `userRoleSnapshot`, `createdAt` from the current session.

**Viewing permissions:**
- Owner → sees all entries
- Manager → sees only `approval` entity types or `approve`/`reject` actions
- Finance → sees only `tempo` entity types or `mark_paid`/`partial_paid` actions

---

## 8. Approval Workflow

**File:** `lib/approval/store.ts`

When `REQUIRE_APPROVAL_PENJUALAN=true` (or relevant module), Admin-created records go to `pending_approval` instead of `approved`.

```ts
// Status flow
draft → pending_approval → approved
                        → rejected
                        → cancelled
```

**Key rules enforced in code:**
- Admin cannot approve their own records (`before.createdByUserId === user.id && user.role !== "OWNER"` throws)
- Rejection requires a reason string
- When a penjualan is approved and payment is Tempo, `createTempoReceivable()` is called automatically

**Pages:**
- `/approval` — split view: "Menunggu" (pending) + "Riwayat" (history)
- `/approval/[id]` — detail + approve/reject form

---

## 9. Tempo System

**File:** `lib/tempo/store.ts`

Tempo is a proper receivable, not just a note.

```ts
type TempoReceivable = {
  id: string;
  salesId: string;
  customerName: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  transactionDate: string;
  dueDate: string;
  status: "open" | "paid" | "partial_paid" | "overdue" | "cancelled" | "written_off";
  tipeCodeSnapshot: string;
  tipeNameSnapshot: string;
  // ... creator fields
};
```

**Key business rules:**
- Tempo is **excluded from Grand Total** until paid.
- Overdue is computed dynamically (not stored): `status === "open" && dueDate < today`.
- Open Tempo appears in every daily WhatsApp report until Paid / Cancelled / Written Off.
- Only OWNER and FINANCE can call `payTempo()` — enforced at both API route level and store level.
- Partial payment: `remainingAmount = originalAmount - paidAmount`. Status stays `partial_paid` until `remainingAmount <= 0`.

**API:**
```
POST /api/tempo/[id]/pay     → requires tempo.mark_paid permission
```

---

## 10. WhatsApp Reporting

**Files:** `lib/whatsapp/`

### Provider abstraction

Set `WHATSAPP_PROVIDER` in env:
- `mock` — logs to console and returns mock "sent" status (default)
- `meta_cloud_api` — uses Meta WhatsApp Cloud API
- `third_party` — uses third-party WABA provider

### Report types

| Type | Trigger | Format file |
|------|---------|-------------|
| `daily_report` | `POST /api/jobs/send-daily-report` | `reportFormatter.ts` |
| `tempo_reminder` | `POST /api/jobs/send-tempo-reminder` | `reportFormatter.ts` |
| `stock_alert` | After stock update, auto-triggered | `stockAlerts/store.ts` |
| `test` | `/api/whatsapp/test` | inline |

### Daily report format

```
Laporan Harian Aneka Jaya - 26/06/2026

Grand Total: Rp 12.500.000
(exclude tempo)

SLM
Cash: Rp 4.000.000
TF: Rp 5.500.000

W
Cash: Rp 1.000.000
TF: Rp 2.000.000

Tempo:
1. Toko Berkah - Rp 3.000.000 - Jatuh tempo: 05/07/2026
2. Sinar Jaya - Rp 1.500.000 remaining from Rp 3.000.000 - Jatuh tempo: 10/07/2026
```

### Cron job setup

All job routes require header `x-cron-secret: <CRON_SECRET>` or `?secret=<CRON_SECRET>`.

Recommended schedule (Asia/Jakarta):
```
POST /api/jobs/send-daily-report      → 20:00 daily
POST /api/jobs/send-tempo-reminder    → 09:00 daily
POST /api/jobs/check-stock-alert      → 06:00 daily + after any stock change
POST /api/jobs/retry-erp-sync         → 07:00 daily (optional)
```

---

## 11. Stock Minimum Alert

**File:** `lib/stockAlerts/store.ts`

```ts
await checkStockMinimumAlert(productOrStockItem);
```

**De-duplication logic:**
- Alert fires only once per product per "dip below minimum" event.
- When stock goes back above minimum, the alert is marked `resolved`.
- A new alert fires on the next dip, not continuously.
- Trigger manually via `POST /api/jobs/check-stock-alert`.

---

## 12. ERP Integration

**Base URL:** `https://ankjy.playgo.id/api/integrations`  
**Docs:** `https://ankjy.playgo.id/integrations/docs`

All ERP requests happen **server-side only** in `lib/api/`.

| Action | ERP endpoint | Method |
|--------|-------------|--------|
| List products | `/products` | GET |
| Update product | `/products/{id}` | PUT |
| Create sale | `/neo/commands` | POST |
| Import product | `/neo/commands` | POST |
| List stocks | `/stocks` | GET |
| List invoices | `/invoices` | GET |

Sales and product creation use the Neo command envelope:
```ts
{
  text: string,          // human-readable instruction
  message_id: string,
  source: "internal_app",
  parsed_intent: { ... }
}
```

Expenses use a natural-language Neo command because the direct finance endpoint was not in the provided OpenAPI spec.

---

## 13. Production Deployment

### Docker

```bash
# Build image
docker build -t aneka-jaya-app .

# Run with persistent data volume
docker run -d \
  -p 3000:3000 \
  -v /your/host/data:/app/data \
  --env-file .env.production \
  aneka-jaya-app
```

Or use `docker-compose.yml` — already configured with a `data` volume.

### What to do before going live

1. **Connect real SSO** — edit `lib/auth/session.ts` → replace the cookie-based `getCurrentUser()` with your identity provider (e.g., NextAuth, Clerk, custom JWT).
2. **Fill all `.env.local` tokens** — ERP token, WhatsApp token, OpenCloud key, CRON_SECRET.
3. **Set `NEXT_PUBLIC_APP_MODE=production`**.
4. **Mount `data/` as persistent volume** — or migrate the JSON stores to a real database (Prisma models listed in README).
5. **Set up cron** — point your scheduler (Vercel Cron, Railway cron, external cron service) at the `/api/jobs/*` endpoints.
6. **Disable RoleSelector** in production — the `RoleSelector` component in Settings is for demo only. It reads `APP_DEFAULT_ROLE`; in production this is irrelevant once real SSO is connected.

---

## 14. Known Remaining Gaps

| Item | Notes |
|------|-------|
| WhatsApp recipient add/edit UI | `/settings/whatsapp` is read-only. Recipients currently only editable by directly editing `data/whatsapp-recipients.json` or building a form. |
| Real SSO | `lib/auth/session.ts` uses a cookie for role. Integrate your identity provider here. |
| `PaymentListSettings` component | Dead code (was localStorage-based rekening UI, now replaced by server-side RekeningManager). Safe to delete. |
| Finance/Manager tempo cancellation | Only Owner can cancel/write-off Tempo currently. Add `tempo.cancel` permission to FINANCE if needed. |
| Database migration | For high-traffic production, migrate JSON stores to PostgreSQL via Prisma. Models are documented in README. |

---

## 15. File-by-file Change Log (This Session)

These files were **created or modified** during the consulting/analysis session:

### Created (new files)
| File | Purpose |
|------|---------|
| `lib/data/jsonStore.ts` | **Critical** — was missing from ZIP; all data stores depend on it |
| `middleware.ts` | Route-level permission enforcement across all pages |
| `app/api/tipe/route.ts` | CRUD API for Tipe Pembukuan (Owner only) |
| `app/api/rekening/route.ts` | CRUD API for Rekening accounts (Owner only) |
| `app/settings/tipe/page.tsx` | Tipe management page for Owner |
| `app/settings/rekening/page.tsx` | Rekening management page for Owner |
| `components/settings/TipeManager.tsx` | Client component for adding/toggling Tipe |
| `components/settings/RekeningManager.tsx` | Client component for adding Rekening + assigning to Tipe |

### Modified
| File | Change |
|------|--------|
| `lib/business/masterData.ts` | Made async + JSON-persistent (was hardcoded static arrays) |
| `lib/api/sales.ts` | `await findTipe()` (findTipe is now async) |
| `lib/api/expenses.ts` | `await findTipe()` |
| `app/dashboard/page.tsx` | Added permission guard; real KPIs; real user name |
| `app/settings/page.tsx` | Added permission guard; replaced content with management cards |
| `app/api/tempo/[id]/pay/route.ts` | Added missing `tempo.mark_paid` permission check |
| `app/approval/page.tsx` | Split pending vs history; status badges; count chip |
| `app/penjualan/input/page.tsx` | Passes `tipes`/`rekenings` from server to form |
| `app/pengeluaran/input/page.tsx` | Passes `tipes`/`rekenings` from server to form |
| `app/tempo/[id]/page.tsx` | Passes `rekenings` to TempoPayForm; improved layout |
| `components/forms/PenjualanForm.tsx` | Dynamic Tipe dropdown; Rekening filtered by Tipe |
| `components/forms/PengeluaranForm.tsx` | Dynamic Tipe dropdown; Rekening filtered by Tipe |
| `components/tempo/TempoPayForm.tsx` | Dynamic Rekening from props; correct snapshot |
| `.env.example` | Added `DATA_DIR`, corrected `CRON_SECRET` placeholder |
