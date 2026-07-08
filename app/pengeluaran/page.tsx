import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listExpenseFilterOptions, listExpenseRecordsPage, type ExpenseRecordFilters } from "@/lib/expenses/store";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;

const statusClass: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
  pending: "bg-amber-50 text-amber-700",
  synced: "bg-emerald-50 text-emerald-700",
  not_required: "bg-slate-100 text-slate-600"
};

type SearchParams = Record<string, string | string[] | undefined>;

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
  return `/pengeluaran?${next.toString()}`;
}

function filtersFromParams(params: SearchParams): ExpenseRecordFilters {
  return {
    from: valueOf(params, "from") || undefined,
    to: valueOf(params, "to") || undefined,
    keyword: valueOf(params, "keyword") || undefined,
    tipe: valueOf(params, "tipe") || undefined,
    rekening: valueOf(params, "rekening") || undefined,
    approvalStatus: valueOf(params, "approvalStatus") || undefined,
    erpSyncStatus: valueOf(params, "erpSyncStatus") || undefined
  };
}

function activeFilterLabels(params: SearchParams) {
  return [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "keyword") ? `Keyword: ${valueOf(params, "keyword")}` : null,
    valueOf(params, "tipe") ? `Tipe: ${valueOf(params, "tipe")}` : null,
    valueOf(params, "rekening") ? `Rekening: ${valueOf(params, "rekening")}` : null,
    valueOf(params, "approvalStatus") ? `Approval: ${valueOf(params, "approvalStatus")}` : null,
    valueOf(params, "erpSyncStatus") ? `ERP: ${valueOf(params, "erpSyncStatus")}` : null
  ].filter(Boolean) as string[];
}

export default async function PengeluaranHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "pengeluaran.view")) redirect("/");
  const canManage = can(role, "pengeluaran.manage");
  const params = await searchParams || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const [{ data: paged, meta }, { tipeOptions, rekeningOptions }] = await Promise.all([
    listExpenseRecordsPage({ page, pageSize: PAGE_SIZE, filters: filtersFromParams(params) }),
    listExpenseFilterOptions()
  ]);
  const totalPages = meta.totalPages;
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const activeFilters = activeFilterLabels(params);

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">ExpenseRecord</p>
          <h2 className="aj-page-title text-3xl font-bold">Riwayat Pengeluaran</h2>
          <p className="mt-2 text-sm text-slate-600">Daftar pengeluaran permanen beserta status approval dan ERP sync.</p>
        </div>
        {can(role, "pengeluaran.create") && <Link href="/pengeluaran/input" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">+ Input Pengeluaran</Link>}
      </div>
      <section className="aj-surface mb-5 p-5">
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="text-sm font-medium text-slate-700">Dari tanggal<Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Sampai tanggal<Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Keyword<Input name="keyword" defaultValue={valueOf(params, "keyword") || ""} placeholder="Vendor / deskripsi / nomor" className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Tipe<Select name="tipe" defaultValue={valueOf(params, "tipe") || ""} className="mt-1"><option value="">Semua</option>{tipeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">Rekening<Select name="rekening" defaultValue={valueOf(params, "rekening") || ""} className="mt-1"><option value="">Semua</option>{rekeningOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">Approval<Select name="approvalStatus" defaultValue={valueOf(params, "approvalStatus") || ""} className="mt-1"><option value="">Semua</option>{["draft", "pending_approval", "approved", "rejected", "cancelled"].map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">ERP Sync<Select name="erpSyncStatus" defaultValue={valueOf(params, "erpSyncStatus") || ""} className="mt-1"><option value="">Semua</option>{["pending", "synced", "failed", "not_required"].map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <div className="grid gap-2 md:col-span-4 sm:flex xl:col-span-7">
            <button className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Filter</button>
            <Link className="rounded-sm border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/pengeluaran">Reset</Link>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {activeFilters.length > 0 ? activeFilters.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{item}</span>) : <span className="text-slate-500">Filter aktif: semua pengeluaran.</span>}
        </div>
      </section>
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {paged.length} dari {meta.total} pengeluaran.</div>
        <div className="space-y-3 p-4 md:hidden">
          {paged.map((expense) => (
            <article key={expense.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{expense.vendorName}</p>
                  <p className="mt-1 text-xs text-slate-500">{expense.expenseDate} • {expense.tipeCodeSnapshot} • {expense.category}</p>
                </div>
                <p className="shrink-0 text-right font-bold text-slate-900">{rupiah(expense.amount)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[expense.approvalStatus || "approved"] || "bg-slate-100 text-slate-600"}`}>{expense.approvalStatus || "approved"}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[expense.erpSyncStatus || "not_required"] || "bg-slate-100 text-slate-600"}`}>{expense.erpSyncStatus || "not_required"}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rekening</dt><dd className="mt-0.5">{expense.rekeningNameSnapshot}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">COA / Kategori</dt><dd className="mt-0.5">{expense.coaNameSnapshot} / {expense.category}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link className="rounded-sm bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700" href={`/pengeluaran/${expense.id}`}>Detail</Link>
                <Link className="rounded-sm border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/print/expenses/${expense.id}`}>Cetak</Link>
                {expense.attachmentUrl && <a className="rounded-sm border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={expense.attachmentUrl} target="_blank" rel="noreferrer">Lampiran</a>}
                {canManage && expense.approvalStatus !== "cancelled" && <Link className="rounded-sm border border-blue-200 px-3 py-2 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50" href={`/pengeluaran/${expense.id}/edit`}>Edit</Link>}
                {canManage && <TransactionCancelButton id={expense.id} kind="expenses" disabled={expense.approvalStatus === "cancelled" || (expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced")} disabledReason={expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced" ? "Pengeluaran AJ sudah synced ke ERP dan perlu mekanisme koreksi resmi." : "Pengeluaran sudah dibatalkan."} />}
              </div>
            </article>
          ))}
          {paged.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada pengeluaran sesuai filter.</p>}
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
                <th className="px-5 py-3">Approval</th>
                <th className="px-5 py-3">ERP Sync</th>
                <th className="px-5 py-3">Lampiran</th>
                <th className="px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((expense) => (
              <tr key={expense.id} className="border-b border-slate-100">
                <td className="px-5 py-4 text-slate-600">{expense.expenseDate}</td>
                <td className="px-5 py-4 font-semibold">{expense.tipeCodeSnapshot}</td>
                <td className="px-5 py-4">{expense.rekeningNameSnapshot}</td>
                <td className="px-5 py-4">{expense.coaNameSnapshot} / {expense.category}</td>
                <td className="px-5 py-4">{expense.vendorName}</td>
                <td className="px-5 py-4 text-right font-semibold">{rupiah(expense.amount)}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[expense.approvalStatus || "approved"] || "bg-slate-100 text-slate-600"}`}>{expense.approvalStatus || "approved"}</span></td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[expense.erpSyncStatus || "not_required"] || "bg-slate-100 text-slate-600"}`}>{expense.erpSyncStatus || "not_required"}</span></td>
                <td className="px-5 py-4">{expense.attachmentUrl ? <a className="font-semibold text-emerald-700 hover:text-emerald-800" href={expense.attachmentUrl} target="_blank" rel="noreferrer">Buka</a> : "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-2">
                    <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href={`/pengeluaran/${expense.id}`}>Detail</Link>
                    <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href={`/print/expenses/${expense.id}`}>Cetak</Link>
                    {canManage && (
                      <>
                        {expense.approvalStatus !== "cancelled" && <Link className="font-semibold text-blue-700 hover:text-blue-800" href={`/pengeluaran/${expense.id}/edit`}>Edit</Link>}
                        <TransactionCancelButton
                          id={expense.id}
                          kind="expenses"
                          disabled={expense.approvalStatus === "cancelled" || (expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced")}
                          disabledReason={expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced" ? "Pengeluaran AJ sudah synced ke ERP dan perlu mekanisme koreksi resmi." : "Pengeluaran sudah dibatalkan."}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
              ))}
              {paged.length === 0 && <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-500">Tidak ada pengeluaran sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
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
