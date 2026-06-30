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

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

async function erpConfigStatus() {
  const hasBaseUrl = Boolean(process.env.ANIKA_ERP_API_BASE_URL);
  const hasStaticToken = Boolean(process.env.ANIKA_ERP_API_TOKEN);
  const provider = resolveAuthProvider();
  const hasSessionToken = provider === "anika_erp" ? Boolean(await currentAnikaErpToken()) : false;
  if (!hasBaseUrl) return { ok: false, label: "Belum dikonfigurasi", message: "ANIKA_ERP_API_BASE_URL belum tersedia di server.", warning: undefined };
  if (hasStaticToken) return { ok: true, label: "Siap", message: "ERP siap dipakai untuk retry sinkronisasi.", warning: undefined };
  if (hasSessionToken) return { ok: true, label: "Siap", message: "ERP siap dipakai untuk retry manual berbasis sesi login.", warning: "ANIKA_ERP_API_TOKEN belum diisi. Manual retry bisa memakai sesi login, tetapi cron production sebaiknya memakai token statis server-side." };
  return { ok: false, label: provider === "anika_erp" ? "Perlu login ulang" : "Token belum dikonfigurasi", message: provider === "anika_erp" ? "Sesi ERP tidak tersedia. Silakan login ulang sebelum retry." : "ANIKA_ERP_API_TOKEN belum tersedia di server.", warning: undefined };
}

export default async function ErpSyncPage() {
  const role = await getCurrentRole();
  if (!can(role, "erp_sync.retry")) redirect("/");
  const [salesOverview, expenseOverview, config, preflight] = await Promise.all([getErpSyncOverview(), getExpenseSyncOverview(), erpConfigStatus(), getErpSyncPreflight()]);
  const summary = {
    pending: salesOverview.summary.pending + expenseOverview.summary.pending,
    failed: salesOverview.summary.failed + expenseOverview.summary.failed,
    synced: salesOverview.summary.synced + expenseOverview.summary.synced
  };
  const runtimeWarnings = [salesOverview.warning, expenseOverview.warning].filter(Boolean);
  return <AppShell><div className="mb-7"><h2 className="aj-page-title text-3xl font-bold">ERP Sync</h2><p className="mt-2 text-sm text-slate-600">Pantau transaksi AJ yang gagal/pending dan retry sinkronisasi ke Aneka Jaya ERP.</p></div>
    {runtimeWarnings.length > 0 && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">ERP Sync storage belum siap</p><p className="mt-1">{Array.from(new Set(runtimeWarnings)).join(" ")}</p></div>}
    {config.warning && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Konfigurasi retry ERP perlu diperkuat</p><p className="mt-1">{config.warning}</p></div>}
    {!preflight.fallbackCustomer.found && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Fallback customer ERP belum siap</p><p className="mt-1">{preflight.fallbackCustomer.message} Buat customer ERP code <code>{preflight.fallbackCustomer.code || "WALK-IN"}</code> atau isi env <code>ANIKA_ERP_FALLBACK_CUSTOMER_CODE</code>.</p></div>}
    <div className="mb-5 grid gap-3 md:grid-cols-4">
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ERP Status</p><p className={config.ok ? "mt-1 text-lg font-bold text-emerald-700" : "mt-1 text-lg font-bold text-amber-700"}>{config.label}</p><p className="mt-1 text-xs text-slate-500">{config.message}</p></div>
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p><p className="mt-1 text-2xl font-bold text-slate-900">{summary.pending}</p></div>
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failed</p><p className="mt-1 text-2xl font-bold text-red-700">{summary.failed}</p></div>
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synced</p><p className="mt-1 text-2xl font-bold text-emerald-700">{summary.synced}</p></div>
    </div>
    <div className="mb-5 grid gap-3 md:grid-cols-2">
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fallback Customer</p><p className={preflight.fallbackCustomer.found ? "mt-1 text-lg font-bold text-emerald-700" : "mt-1 text-lg font-bold text-amber-700"}>{preflight.fallbackCustomer.found ? "Siap" : preflight.fallbackCustomer.configured ? "Belum ditemukan" : "Belum dikonfigurasi"}</p><p className="mt-1 text-xs text-slate-500">Code: <code>{preflight.fallbackCustomer.code || "—"}</code> · {preflight.fallbackCustomer.message}</p></div>
      <div className="aj-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preflight ERP</p><p className={preflight.erp.baseUrlConfigured && preflight.erp.authReady ? "mt-1 text-lg font-bold text-emerald-700" : "mt-1 text-lg font-bold text-amber-700"}>{preflight.erp.baseUrlConfigured && preflight.erp.authReady ? "Bisa dicek" : "Belum lengkap"}</p><p className="mt-1 text-xs text-slate-500">Base URL {preflight.erp.baseUrlConfigured ? "tersedia" : "belum tersedia"} · Auth {preflight.erp.authReady ? "tersedia" : "belum tersedia"}</p></div>
    </div>
    <section className="aj-surface mb-5 overflow-hidden"><div className="border-b border-slate-100 p-5"><p className="font-bold text-slate-900">Penjualan perlu retry</p><p className="mt-1 text-sm text-slate-500">Endpoint cron: <code>/api/jobs/retry-erp-sync</code>. Token ERP tetap server-side dan tidak tampil di browser.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3 text-right">Nominal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Error</th><th className="px-5 py-3">Terakhir dicoba</th><th className="px-5 py-3">Aksi</th></tr></thead><tbody>{salesOverview.items.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-5 py-4 text-slate-600">{item.saleDate}</td><td className="px-5 py-4 font-semibold">{item.tipeCode}</td><td className="px-5 py-4">{item.customerName}</td><td className="px-5 py-4 text-right">{rupiah(item.total)}</td><td className="px-5 py-4"><span className={item.syncStatus === "failed" ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"}>{item.syncStatus}</span></td><td className="max-w-xs px-5 py-4 text-slate-600">{item.syncError || "—"}</td><td className="px-5 py-4 text-slate-500">{item.syncAttemptedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.syncAttemptedAt)) : "—"}</td><td className="px-5 py-4">{item.retryable ? <ErpRetryButton id={item.id} kind="sales" /> : "—"}</td></tr>)}{salesOverview.items.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Tidak ada penjualan ERP pending atau gagal.</td></tr>}</tbody></table></div></section>
    <section className="aj-surface overflow-hidden"><div className="border-b border-slate-100 p-5"><p className="font-bold text-slate-900">Pengeluaran perlu retry</p><p className="mt-1 text-sm text-slate-500">Pengeluaran AJ memakai command Kas & Bank dan bisa diretry dari sini.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Rekening</th><th className="px-5 py-3">COA / Kategori</th><th className="px-5 py-3">Vendor</th><th className="px-5 py-3 text-right">Nominal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Error</th><th className="px-5 py-3">Terakhir dicoba</th><th className="px-5 py-3">Aksi</th></tr></thead><tbody>{expenseOverview.items.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-5 py-4 text-slate-600">{item.expenseDate}</td><td className="px-5 py-4 font-semibold">{item.tipeCode}</td><td className="px-5 py-4">{item.rekeningName}</td><td className="px-5 py-4">{item.coaName} / {item.category}</td><td className="px-5 py-4">{item.vendorName}</td><td className="px-5 py-4 text-right">{rupiah(item.amount)}</td><td className="px-5 py-4"><span className={item.erpSyncStatus === "failed" ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"}>{item.erpSyncStatus}</span></td><td className="max-w-xs px-5 py-4 text-slate-600">{item.erpSyncError || "—"}</td><td className="px-5 py-4 text-slate-500">{item.erpSyncAttemptedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.erpSyncAttemptedAt)) : "—"}</td><td className="px-5 py-4">{item.retryable ? <ErpRetryButton id={item.id} kind="expenses" /> : "—"}</td></tr>)}{expenseOverview.items.length === 0 && <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-500">Tidak ada pengeluaran ERP pending atau gagal.</td></tr>}</tbody></table></div></section>
  </AppShell>;
}
