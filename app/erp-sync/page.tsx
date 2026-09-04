import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { currentAnikaErpToken } from "@/lib/auth/anikaErp";
import { resolveAuthProvider } from "@/lib/auth/request";
import { getErpSyncOverview } from "@/lib/erpSync/salesRetry";
import { getExpenseSyncOverview } from "@/lib/erpSync/expenseRetry";
import { getErpSyncPreflight } from "@/lib/erpSync/preflight";
import { ErpRetryButton } from "@/components/erpSync/ErpRetryButton";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 10;

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function toPage(value?: string) {
  const page = Number(value || "1");
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function pageHref(
  params: SearchParams,
  key: "salesPage" | "expensePage",
  page: number,
) {
  const next = new URLSearchParams();
  for (const [paramKey, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && paramKey !== key) next.set(paramKey, value);
  }
  next.set(key, String(page));
  return `/erp-sync?${next.toString()}`;
}

async function erpConfigStatus() {
  const hasBaseUrl = Boolean(process.env.ANIKA_ERP_API_BASE_URL);
  const hasStaticToken = Boolean(process.env.ANIKA_ERP_API_TOKEN);
  const provider = resolveAuthProvider();
  const hasSessionToken =
    provider === "anika_erp" ? Boolean(await currentAnikaErpToken()) : false;
  if (!hasBaseUrl)
    return {
      ok: false,
      label: "Belum dikonfigurasi",
      message: "ANIKA_ERP_API_BASE_URL belum tersedia di server.",
      warning:
        "ERP Sync belum bisa dipakai karena base URL ERP belum tersedia.",
      note: undefined,
    };
  if (hasStaticToken)
    return {
      ok: true,
      label: "Siap",
      message: "ERP siap dipakai untuk retry sinkronisasi.",
      warning: undefined,
      note: undefined,
    };
  if (hasSessionToken)
    return {
      ok: true,
      label: "Siap",
      message: "ERP siap dipakai untuk retry manual berbasis sesi login.",
      warning: undefined,
      note: "Manual retry siap via sesi login. Token statis hanya diperlukan untuk cron production.",
    };
  return {
    ok: false,
    label:
      provider === "anika_erp"
        ? "Perlu login ulang"
        : "Token belum dikonfigurasi",
    message:
      provider === "anika_erp"
        ? "Sesi ERP tidak tersedia. Silakan login ulang sebelum retry."
        : "ANIKA_ERP_API_TOKEN belum tersedia di server.",
    warning:
      provider === "anika_erp"
        ? "Sesi ERP tidak tersedia. Silakan login ulang sebelum retry."
        : "Token ERP server-side belum tersedia.",
    note: undefined,
  };
}

export default async function ErpSyncPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const role = await getCurrentRole();
  if (!can(role, "erp_sync.retry")) redirect("/");
  const params = (await searchParams) || {};
  const salesPage = toPage(valueOf(params, "salesPage"));
  const expensePage = toPage(valueOf(params, "expensePage"));
  const [salesOverview, expenseOverview, config, preflight] = await Promise.all(
    [
      getErpSyncOverview({ page: salesPage, pageSize: PAGE_SIZE }),
      getExpenseSyncOverview({ page: expensePage, pageSize: PAGE_SIZE }),
      erpConfigStatus(),
      getErpSyncPreflight(),
    ],
  );
  const summary = {
    pending: salesOverview.summary.pending + expenseOverview.summary.pending,
    failed: salesOverview.summary.failed + expenseOverview.summary.failed,
    synced: salesOverview.summary.synced + expenseOverview.summary.synced,
  };
  const runtimeWarnings = [
    salesOverview.warning,
    expenseOverview.warning,
  ].filter(Boolean);
  return (
    <AppShell>
      <div className="mb-7">
        <h2 className="aj-page-title text-3xl font-bold">ERP Sync</h2>
        <p className="mt-2 text-sm text-slate-600">
          Pantau invoice ERP dan release stok yang gagal/pending untuk retry
          sinkronisasi ke Aneka Jaya ERP.
        </p>
      </div>
      {runtimeWarnings.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">ERP Sync storage belum siap</p>
          <p className="mt-1">
            {Array.from(new Set(runtimeWarnings)).join(" ")}
          </p>
        </div>
      )}
      {config.warning && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Konfigurasi retry ERP perlu diperkuat</p>
          <p className="mt-1">{config.warning}</p>
        </div>
      )}
      {!preflight.autoCreateCustomer.enabled && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Auto-create customer ERP nonaktif</p>
          <p className="mt-1">
            Aktifkan <code>ANIKA_ERP_AUTO_CREATE_CUSTOMER=true</code> agar
            transaksi AJ dengan customer manual bisa membuat customer ERP
            otomatis sebelum dikirim ke Aneka Jaya ERP.
          </p>
        </div>
      )}
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP Status
          </p>
          <p
            className={
              config.ok
                ? "mt-1 text-lg font-bold text-emerald-700"
                : "mt-1 text-lg font-bold text-amber-700"
            }
          >
            {config.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">{config.message}</p>
          {config.note && (
            <p className="mt-2 text-xs text-slate-400">{config.note}</p>
          )}
        </div>
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {summary.pending}
          </p>
        </div>
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Failed
          </p>
          <p className="mt-1 text-2xl font-bold text-red-700">
            {summary.failed}
          </p>
        </div>
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Synced
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {summary.synced}
          </p>
        </div>
      </div>
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Auto-create Customer
          </p>
          <p
            className={
              preflight.autoCreateCustomer.enabled
                ? "mt-1 text-lg font-bold text-emerald-700"
                : "mt-1 text-lg font-bold text-amber-700"
            }
          >
            {preflight.autoCreateCustomer.enabled ? "Aktif" : "Nonaktif"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {preflight.autoCreateCustomer.message}
          </p>
        </div>
        <div className="aj-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preflight ERP
          </p>
          <p
            className={
              preflight.erp.baseUrlConfigured && preflight.erp.authReady
                ? "mt-1 text-lg font-bold text-emerald-700"
                : "mt-1 text-lg font-bold text-amber-700"
            }
          >
            {preflight.erp.baseUrlConfigured && preflight.erp.authReady
              ? "Bisa dicek"
              : "Belum lengkap"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Base URL{" "}
            {preflight.erp.baseUrlConfigured ? "tersedia" : "belum tersedia"} ·
            Auth {preflight.erp.authReady ? "tersedia" : "belum tersedia"}
          </p>
        </div>
      </div>
      <section className="aj-surface mb-5 overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <p className="font-bold text-slate-900">Penjualan perlu retry</p>
          <p className="mt-1 text-sm text-slate-500">
            Retry dapat berupa kirim invoice ERP, release stok, atau payment
            setelah invoice dan stok aman.
          </p>
        </div>
        <div
          data-testid="erp-sales-mobile-cards"
          className="space-y-3 p-4 md:hidden"
        >
          {salesOverview.items.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        item.source === "MJ"
                          ? "rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                          : "rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                      }
                    >
                      {item.source || "SLM"}
                    </span>
                    <a
                      href={`/penjualan/${item.id}`}
                      className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                    >
                      {item.customerName}
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.saleDate} • {item.tipeCode}
                    {(item.externalReference || item.transactionNumber) && (
                      <span> • {item.externalReference || item.transactionNumber}</span>
                    )}
                  </p>
                </div>
                <p className="font-bold text-slate-900">{rupiah(item.total)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={
                    item.syncStatus === "failed"
                      ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                      : item.syncStatus === "synced"
                        ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                        : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                  }
                >
                  Invoice {item.syncStatus}
                </span>
                {item.stockReleaseStatus && (
                  <span
                    className={
                      item.stockReleaseStatus === "failed"
                        ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                        : ["released", "already_released"].includes(item.stockReleaseStatus)
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                          : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                    }
                  >
                    Stok {item.stockReleaseStatus}
                  </span>
                )}
                {item.erpPaymentStatus && (
                  <span
                    className={
                      item.erpPaymentStatus === "failed"
                        ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                        : item.erpPaymentStatus === "paid" ||
                            item.erpPaymentStatus === "partial"
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                          : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                    }
                  >
                    Payment {item.erpPaymentStatus}
                  </span>
                )}
                {item.syncAttemptedAt && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    }).format(new Date(item.syncAttemptedAt))}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {item.syncError ||
                  item.stockReleaseError ||
                  item.erpPaymentError ||
                  "Tidak ada pesan error."}
              </p>
              <div className="mt-4">
                {item.retryable ? (
                  <ErpRetryButton id={item.id} kind="sales" />
                ) : (
                  <span className="text-sm text-slate-500">
                    Tidak tersedia retry.
                  </span>
                )}
              </div>
            </article>
          ))}
          {salesOverview.items.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              Tidak ada penjualan ERP pending atau gagal.
            </p>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 text-right">Nominal</th>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Release Stok</th>
                <th className="px-5 py-3">Payment ERP</th>
                <th className="px-5 py-3">Error</th>
                <th className="px-5 py-3">Terakhir dicoba</th>
                <th className="px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {salesOverview.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-5 py-4 text-slate-600">{item.saleDate}</td>
                  <td className="px-5 py-4 font-semibold">{item.tipeCode}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          item.source === "MJ"
                            ? "rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                            : "rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                        }
                      >
                        {item.source || "SLM"}
                      </span>
                      <a
                        href={`/penjualan/${item.id}`}
                        className="font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {item.customerName}
                      </a>
                    </div>
                    {(item.externalReference || item.transactionNumber) && (
                      <span className="block text-xs text-slate-500">
                        {item.externalReference || item.transactionNumber}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">{rupiah(item.total)}</td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        item.syncStatus === "failed"
                          ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                          : item.syncStatus === "synced"
                            ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                            : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                      }
                    >
                      {item.syncStatus}
                    </span>
                    {(item.erpInvoiceNumber || item.erpReference) && (
                      <span className="block text-[11px] text-slate-500 font-mono mt-0.5">
                        {item.erpInvoiceNumber || item.erpReference}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {item.stockReleaseStatus ? (
                      <span
                        className={
                          item.stockReleaseStatus === "failed"
                            ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                            : ["released", "already_released"].includes(item.stockReleaseStatus)
                              ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                              : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                        }
                      >
                        {item.stockReleaseStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {item.erpPaymentStatus ? (
                      <span
                        className={
                          item.erpPaymentStatus === "failed"
                            ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                            : item.erpPaymentStatus === "paid" ||
                                item.erpPaymentStatus === "partial"
                              ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                              : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                        }
                      >
                        {item.erpPaymentStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs px-5 py-4 text-slate-600">
                    {item.syncError ||
                      item.stockReleaseError ||
                      item.erpPaymentError ||
                      "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {item.syncAttemptedAt
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(item.syncAttemptedAt))
                      : "—"}
                  </td>
                  <td className="px-5 py-4">
                    {item.retryable ? (
                      <ErpRetryButton id={item.id} kind="sales" />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {salesOverview.items.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Tidak ada penjualan ERP pending atau gagal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          current={salesOverview.meta.page}
          totalPages={salesOverview.meta.totalPages}
          total={salesOverview.meta.total}
          hrefFor={(page) => pageHref(params, "salesPage", page)}
        />
      </section>
      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <p className="font-bold text-slate-900">Pengeluaran perlu retry</p>
          <p className="mt-1 text-sm text-slate-500">
            Pengeluaran AJ memakai command Kas & Bank dan bisa diretry dari
            sini.
          </p>
        </div>
        <div
          data-testid="erp-expense-mobile-cards"
          className="space-y-3 p-4 md:hidden"
        >
          {expenseOverview.items.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <a
                    href={`/pengeluaran/${item.id}`}
                    className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                  >
                    {item.vendorName}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.expenseDate} • {item.tipeCode}
                  </p>
                </div>
                <p className="font-bold text-slate-900">
                  {rupiah(item.amount)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={
                    item.erpSyncStatus === "failed"
                      ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                      : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                  }
                >
                  {item.erpSyncStatus}
                </span>
                {item.erpSyncAttemptedAt && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    }).format(new Date(item.erpSyncAttemptedAt))}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {item.rekeningName} • {item.coaName} / {item.category}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {item.erpSyncError || "Tidak ada pesan error."}
              </p>
              <div className="mt-4">
                {item.retryable ? (
                  <ErpRetryButton id={item.id} kind="expenses" />
                ) : (
                  <span className="text-sm text-slate-500">
                    Tidak tersedia retry.
                  </span>
                )}
              </div>
            </article>
          ))}
          {expenseOverview.items.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              Tidak ada pengeluaran ERP pending atau gagal.
            </p>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Rekening</th>
                <th className="px-5 py-3">COA / Kategori</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3 text-right">Nominal</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Error</th>
                <th className="px-5 py-3">Terakhir dicoba</th>
                <th className="px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {expenseOverview.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-5 py-4 text-slate-600">
                    {item.expenseDate}
                  </td>
                  <td className="px-5 py-4 font-semibold">{item.tipeCode}</td>
                  <td className="px-5 py-4">{item.rekeningName}</td>
                  <td className="px-5 py-4">
                    {item.coaName} / {item.category}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={`/pengeluaran/${item.id}`}
                      className="font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                    >
                      {item.vendorName}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {rupiah(item.amount)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        item.erpSyncStatus === "failed"
                          ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                          : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                      }
                    >
                      {item.erpSyncStatus}
                    </span>
                  </td>
                  <td className="max-w-xs px-5 py-4 text-slate-600">
                    {item.erpSyncError || "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {item.erpSyncAttemptedAt
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(item.erpSyncAttemptedAt))
                      : "—"}
                  </td>
                  <td className="px-5 py-4">
                    {item.retryable ? (
                      <ErpRetryButton id={item.id} kind="expenses" />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {expenseOverview.items.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Tidak ada pengeluaran ERP pending atau gagal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          current={expenseOverview.meta.page}
          totalPages={expenseOverview.meta.totalPages}
          total={expenseOverview.meta.total}
          hrefFor={(page) => pageHref(params, "expensePage", page)}
        />
      </section>
    </AppShell>
  );
}

function Pagination({
  current,
  totalPages,
  total,
  hrefFor,
}: {
  current: number;
  totalPages: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
      <span className="text-slate-500">
        Menampilkan halaman {current} dari {totalPages} • {total} item retry
      </span>
      <div className="flex gap-2">
        {current > 1 && (
          <a
            className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            href={hrefFor(current - 1)}
          >
            Sebelumnya
          </a>
        )}
        {current < totalPages && (
          <a
            className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            href={hrefFor(current + 1)}
          >
            Berikutnya
          </a>
        )}
      </div>
    </div>
  );
}
