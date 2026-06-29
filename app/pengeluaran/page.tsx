import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listExpenseRecords } from "@/lib/expenses/store";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Expense } from "@/lib/types/expenses";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

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

function filterExpenses(expenses: Expense[], params: SearchParams) {
  const from = valueOf(params, "from");
  const to = valueOf(params, "to");
  const keyword = valueOf(params, "keyword")?.trim().toLowerCase();
  const tipe = valueOf(params, "tipe");
  const rekening = valueOf(params, "rekening");
  const approval = valueOf(params, "approvalStatus");
  const sync = valueOf(params, "erpSyncStatus");
  return expenses.filter((expense) => {
    if (from && expense.expenseDate < from) return false;
    if (to && expense.expenseDate > to) return false;
    if (tipe && (expense.tipeCodeSnapshot || expense.tipeId || "") !== tipe) return false;
    if (rekening && (expense.rekeningNameSnapshot || expense.rekeningId || "") !== rekening) return false;
    if (approval && (expense.approvalStatus || "approved") !== approval) return false;
    if (sync && (expense.erpSyncStatus || "not_required") !== sync) return false;
    if (keyword) {
      const haystack = [expense.id, expense.vendorName, expense.description, expense.category, expense.coaNameSnapshot, expense.notes, expense.createdByNameSnapshot].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export default async function PengeluaranHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "pengeluaran.view")) redirect("/");
  const params = await searchParams || {};
  const expenses = await listExpenseRecords();
  const filtered = filterExpenses(expenses, params);
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const tipeOptions = Array.from(new Set(expenses.map((expense) => expense.tipeCodeSnapshot || expense.tipeId).filter(Boolean))).sort() as string[];
  const rekeningOptions = Array.from(new Set(expenses.map((expense) => expense.rekeningNameSnapshot || expense.rekeningId).filter(Boolean))).sort() as string[];
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

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
          <div className="flex gap-2 md:col-span-4 xl:col-span-7">
            <button className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Filter</button>
            <Link className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/pengeluaran">Reset</Link>
          </div>
        </form>
      </section>
      <section className="aj-surface overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {paged.length} dari {filtered.length} pengeluaran.</div>
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
                <td className="px-5 py-4"><Link className="font-semibold text-emerald-700 hover:text-emerald-800" href={`/print/expenses/${expense.id}`}>Cetak</Link></td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-500">Tidak ada pengeluaran sesuai filter.</td></tr>}
          </tbody>
        </table>
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
