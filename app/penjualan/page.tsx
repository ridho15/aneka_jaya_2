import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listSalesRecordsPage, listSalesTipeOptions, type SalesRecordFilters } from "@/lib/sales/store";
import type { Sale } from "@/lib/types/sales";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";

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
    approvalStatus: valueOf(params, "approvalStatus") || undefined,
    syncStatus: valueOf(params, "syncStatus") || undefined
  };
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700"
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value}</span>;
}

function statusTone(value?: string) {
  if (value === "approved" || value === "synced") return "green";
  if (value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled") return "red";
  return "slate";
}

export default async function PenjualanHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "penjualan.create") && !can(role, "reports.view")) redirect("/");
  const canManage = can(role, "penjualan.manage");
  const canViewTransactionNumber = role === "OWNER";
  const params = await searchParams || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const [{ data: paged, meta }, tipeOptions] = await Promise.all([
    listSalesRecordsPage({ page, pageSize: PAGE_SIZE, filters: filtersFromParams(params) }),
    listSalesTipeOptions()
  ]);
  const totalPages = meta.totalPages;
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

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

      <section className="aj-surface mb-5 p-5">
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="text-sm font-medium text-slate-700">Dari tanggal<Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Sampai tanggal<Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Keyword<Input name="keyword" defaultValue={valueOf(params, "keyword") || ""} placeholder="Customer / No transaksi" className="mt-1" /></label>
          <label className="text-sm font-medium text-slate-700">Tipe<Select name="tipe" defaultValue={valueOf(params, "tipe") || ""} className="mt-1"><option value="">Semua</option>{tipeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">Pembayaran<Select name="paymentMethod" defaultValue={valueOf(params, "paymentMethod") || ""} className="mt-1"><option value="">Semua</option>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">Approval<Select name="approvalStatus" defaultValue={valueOf(params, "approvalStatus") || ""} className="mt-1"><option value="">Semua</option>{approvalStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="text-sm font-medium text-slate-700">ERP Sync<Select name="syncStatus" defaultValue={valueOf(params, "syncStatus") || ""} className="mt-1"><option value="">Semua</option>{syncStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <div className="flex gap-2 md:col-span-4 xl:col-span-7">
            <button className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Filter</button>
            <Link className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/penjualan">Reset</Link>
          </div>
        </form>
      </section>

      <section className="aj-surface overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {paged.length} dari {meta.total} transaksi.</div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-5 py-3">Tanggal</th>{canViewTransactionNumber && <th className="px-5 py-3">No Transaksi</th>}<th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Pembayaran</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3">Approval</th><th className="px-5 py-3">ERP Sync</th><th className="px-5 py-3">Pembuat</th><th className="px-5 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {paged.map((sale) => (
              <tr key={sale.id} className="border-b border-slate-100">
                <td className="px-5 py-4 text-slate-600">{sale.saleDate}</td>
                {canViewTransactionNumber && <td className="px-5 py-4 font-mono text-xs text-slate-700">{sale.id}</td>}
                <td className="px-5 py-4"><b>{sale.customerName}</b><p className="mt-0.5 text-xs text-slate-500">{sale.customerLocation || "—"}</p></td>
                <td className="px-5 py-4 font-semibold">{sale.tipeCodeSnapshot || sale.tipeId || "W"}</td>
                <td className="px-5 py-4">{sale.paymentMethod}</td>
                <td className="px-5 py-4 text-right font-semibold">{rupiah(sale.total)}</td>
                <td className="px-5 py-4"><Badge value={sale.approvalStatus || "approved"} tone={statusTone(sale.approvalStatus || "approved")} /></td>
                <td className="px-5 py-4"><Badge value={sale.syncStatus || "local"} tone={statusTone(sale.syncStatus || "local")} /></td>
                <td className="px-5 py-4 text-slate-600">{sale.createdByNameSnapshot || "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-2">
                    <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href={`/penjualan/${sale.id}`}>Detail</Link>
                    <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href={`/print/sales/${sale.id}`}>Cetak</Link>
                    {canManage && (
                      <>
                        {sale.approvalStatus !== "cancelled" && <Link className="font-semibold text-blue-700 hover:text-blue-800" href={`/penjualan/${sale.id}/edit`}>Edit</Link>}
                        <TransactionCancelButton
                          id={sale.id}
                          kind="sales"
                          disabled={sale.approvalStatus === "cancelled" || (sale.syncTarget === "erp" && sale.syncStatus === "synced")}
                          disabledReason={sale.syncTarget === "erp" && sale.syncStatus === "synced" ? "Transaksi AJ sudah synced ke ERP dan perlu mekanisme koreksi resmi." : "Transaksi sudah dibatalkan."}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={canViewTransactionNumber ? 10 : 9} className="px-5 py-10 text-center text-slate-500">Tidak ada penjualan sesuai filter.</td></tr>}
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
