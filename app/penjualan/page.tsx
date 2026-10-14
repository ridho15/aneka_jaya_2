import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import type { SalesRecordFilters } from "@/lib/sales/store";
import { listSalesRecordsPageForUser } from "@/lib/sales/access";
import { listBookkeepingTypes, listRekeningAccounts, type RekeningAccount } from "@/lib/business/masterData";
import type { Sale } from "@/lib/types/sales";
import { SalesHistoryList } from "@/components/transactions/SalesHistoryList";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 10;
const paymentMethods: Sale["paymentMethod"][] = ["Cash", "TF", "Tempo", "Other"];
const approvalStatuses = ["draft", "pending_approval", "approved", "rejected", "cancelled"];
const syncStatuses = ["local", "pending", "synced", "failed"];

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: SearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/penjualan?${next.toString()}`;
}

function filtersFromParams(params: SearchParams): SalesRecordFilters {
  return {
    from: valueOf(params, "from") || undefined,
    to: valueOf(params, "to") || undefined,
    keyword: valueOf(params, "keyword") || undefined,
    tipe: valueOf(params, "tipe") || undefined,
    paymentMethod: valueOf(params, "paymentMethod") || undefined,
    rekening: valueOf(params, "rekening") || undefined,
    approvalStatus: valueOf(params, "approvalStatus") || undefined,
    syncStatus: valueOf(params, "syncStatus") || undefined,
    cctvStatus: valueOf(params, "cctvStatus") || undefined
  };
}

function rekeningLabel(rekening: Pick<RekeningAccount, "bank" | "name">) {
  return rekening.bank && rekening.bank !== rekening.name ? `${rekening.name} - ${rekening.bank}` : rekening.name;
}

function rekeningFilterLabel(rekenings: RekeningAccount[], value?: string) {
  if (!value) return undefined;
  const rekening = rekenings.find((item) => item.id === value || item.name === value);
  return rekening ? rekeningLabel(rekening) : value;
}

function cctvStatusLabel(value?: string) {
  if (value === "detected" || value === "ya") return "Packing DO: Sudah";
  if (value === "undetected" || value === "tidak") return "Packing DO: Belum";
  return null;
}

function activeFilterLabels(params: SearchParams, rekenings: RekeningAccount[]) {
  return [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "keyword") ? `Keyword: ${valueOf(params, "keyword")}` : null,
    valueOf(params, "tipe") ? `Tipe: ${valueOf(params, "tipe")}` : null,
    valueOf(params, "paymentMethod") ? `Pembayaran: ${valueOf(params, "paymentMethod")}` : null,
    valueOf(params, "rekening") ? `Rekening: ${rekeningFilterLabel(rekenings, valueOf(params, "rekening"))}` : null,
    valueOf(params, "approvalStatus") ? `Approval: ${valueOf(params, "approvalStatus")}` : null,
    valueOf(params, "syncStatus") ? `ERP: ${valueOf(params, "syncStatus")}` : null,
    cctvStatusLabel(valueOf(params, "cctvStatus"))
  ].filter(Boolean) as string[];
}

export default async function PenjualanHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "penjualan.create") && !can(role, "reports.view")) redirect("/");
  const canManage = can(role, "penjualan.manage");
  const canViewTransactionNumber = role === "OWNER";
  const params = await searchParams || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const [{ data: paged, meta }, tipeOptions, rekeningOptions] = await Promise.all([
    listSalesRecordsPageForUser(user, { page, pageSize: PAGE_SIZE, filters: filtersFromParams(params) }),
    listBookkeepingTypes(),
    listRekeningAccounts()
  ]);
  const activeTipeOptions = tipeOptions.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const activeRekeningOptions = rekeningOptions
    .filter((item) => item.isActive !== false)
    .sort((a, b) => rekeningLabel(a).localeCompare(rekeningLabel(b)));
  const totalPages = meta.totalPages;
  const activeFilters = activeFilterLabels(params, activeRekeningOptions);

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">SalesRecord</p>
          <h2 className="aj-page-title text-3xl font-bold">Riwayat Penjualan</h2>
          <p className="mt-2 text-sm text-slate-600">Cari, filter, dan cetak transaksi penjualan yang tersimpan permanen.</p>
        </div>
        {can(role, "penjualan.create") && <Link href="/penjualan/input" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">+ Input Penjualan</Link>}
      </div>

      <ResponsiveFilterPanel
        title="Filter penjualan"
        resetHref="/penjualan"
        activeFilters={activeFilters}
        emptyText="Filter aktif: semua transaksi."
        className="mb-5"
        formClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-9"
        actionsClassName="md:col-span-3 xl:col-span-9"
      >
        <label className="text-sm font-medium text-slate-700">Dari tanggal<Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Sampai tanggal<Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Keyword<Input name="keyword" defaultValue={valueOf(params, "keyword") || ""} placeholder="Customer / No transaksi / Barang" className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Tipe<Select name="tipe" defaultValue={valueOf(params, "tipe") || ""} className="mt-1"><option value="">Semua</option>{activeTipeOptions.map((item) => <option key={item.id} value={item.code}>{item.code}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Pembayaran<Select name="paymentMethod" defaultValue={valueOf(params, "paymentMethod") || ""} className="mt-1"><option value="">Semua</option>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Rekening / bank<Select name="rekening" defaultValue={valueOf(params, "rekening") || ""} className="mt-1"><option value="">Semua</option>{activeRekeningOptions.map((item) => <option key={item.id} value={item.id}>{rekeningLabel(item)}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Approval<Select name="approvalStatus" defaultValue={valueOf(params, "approvalStatus") || ""} className="mt-1"><option value="">Semua</option>{approvalStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">ERP Sync<Select name="syncStatus" defaultValue={valueOf(params, "syncStatus") || ""} className="mt-1"><option value="">Semua</option>{syncStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Status Packing (DO)<Select name="cctvStatus" defaultValue={valueOf(params, "cctvStatus") || ""} className="mt-1"><option value="">Semua</option><option value="detected">Sudah Dipacking</option><option value="undetected">Belum Dipacking</option></Select></label>
      </ResponsiveFilterPanel>

      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {paged.length} dari {meta.total} transaksi.</div>
        <SalesHistoryList sales={paged} canManage={canManage} canViewTransactionNumber={canViewTransactionNumber} />
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <span className="text-slate-500">Halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, page - 1)}>Sebelumnya</Link>}
            {page < totalPages && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, page + 1)}>Berikutnya</Link>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
