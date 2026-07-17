import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listTempoReceivablesPage, listTempoTipeOptions, type TempoReceivableFilters } from "@/lib/tempo/store";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;

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
  return `/tempo?${next.toString()}`;
}

function filtersFromParams(params: SearchParams): TempoReceivableFilters {
  return {
    keyword: valueOf(params, "keyword") || undefined,
    tipe: valueOf(params, "tipe") || undefined,
    status: valueOf(params, "status") || undefined,
    dueFrom: valueOf(params, "dueFrom") || undefined,
    dueTo: valueOf(params, "dueTo") || undefined,
    includeFinal: valueOf(params, "includeFinal") === "1"
  };
}

function activeFilterLabels(params: SearchParams) {
  return [
    valueOf(params, "keyword") ? `Keyword: ${valueOf(params, "keyword")}` : null,
    valueOf(params, "tipe") ? `Tipe: ${valueOf(params, "tipe")}` : null,
    valueOf(params, "status") ? `Status: ${valueOf(params, "status")}` : null,
    valueOf(params, "dueFrom") ? `Jatuh tempo dari ${valueOf(params, "dueFrom")}` : null,
    valueOf(params, "dueTo") ? `Jatuh tempo sampai ${valueOf(params, "dueTo")}` : null,
    valueOf(params, "includeFinal") === "1" ? "Termasuk final" : null
  ].filter(Boolean) as string[];
}

function statusBadgeClass(status: string) {
  if (status === "overdue") return "bg-red-50 text-red-700";
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (["cancelled", "written_off"].includes(status)) return "bg-slate-100 text-slate-600";
  return "bg-blue-50 text-blue-700";
}

export default async function TempoPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "tempo.view")) redirect("/");
  const params = await searchParams || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const [{ data: paged, meta }, tipeOptions] = await Promise.all([
    listTempoReceivablesPage({ page, pageSize: PAGE_SIZE, filters: filtersFromParams(params) }),
    listTempoTipeOptions()
  ]);
  const totalPages = meta.totalPages;
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const activeFilters = activeFilterLabels(params);
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Piutang</p>
        <h2 className="aj-page-title text-3xl font-bold">Tempo</h2>
        <p className="mt-2 text-sm text-slate-600">Default menampilkan open Tempo. Aktifkan final status untuk melihat paid, cancelled, atau written off.</p>
      </div>
      <ResponsiveFilterPanel
        title="Filter tempo"
        resetHref="/tempo"
        activeFilters={activeFilters}
        emptyText="Filter aktif: tempo open."
        className="mb-5"
        formClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
        actionsClassName="md:col-span-3 xl:col-span-6"
      >
        <label className="text-sm font-medium text-slate-700">Keyword<Input name="keyword" defaultValue={valueOf(params, "keyword") || ""} placeholder="Customer / No tempo / No sales" className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Tipe<Select name="tipe" defaultValue={valueOf(params, "tipe") || ""} className="mt-1"><option value="">Semua</option>{tipeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Status<Select name="status" defaultValue={valueOf(params, "status") || ""} className="mt-1"><option value="">Semua</option>{["open", "overdue", "partial_paid", "paid", "cancelled", "written_off"].map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="text-sm font-medium text-slate-700">Jatuh tempo dari<Input type="date" name="dueFrom" defaultValue={valueOf(params, "dueFrom") || ""} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Jatuh tempo sampai<Input type="date" name="dueTo" defaultValue={valueOf(params, "dueTo") || ""} className="mt-1" /></label>
        <label className="flex items-end gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="includeFinal" value="1" defaultChecked={valueOf(params, "includeFinal") === "1"} /> Tampilkan final</label>
      </ResponsiveFilterPanel>
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-600">Menampilkan {paged.length} dari {meta.total} tempo.</div>
        <div className="space-y-3 p-4 md:hidden">
          {paged.map((row) => (
            <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.customerName}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{row.id}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Remaining</dt><dd className="mt-0.5 font-bold text-slate-900">{rupiah(row.remainingAmount)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Jatuh Tempo</dt><dd className="mt-0.5 text-slate-700">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(row.dueDate))}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Original</dt><dd className="mt-0.5 text-slate-700">{rupiah(row.originalAmount)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</dt><dd className="mt-0.5 text-slate-700">{rupiah(row.paidAmount)}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/tempo/${row.id}`} className="rounded-sm bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700">Detail</Link>
                <Link href={`/print/tempo/${row.id}`} className="rounded-sm border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Cetak</Link>
              </div>
            </article>
          ))}
          {paged.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada Tempo sesuai filter.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Original</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Remaining</th><th className="px-5 py-3">Jatuh Tempo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{paged.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-5 py-4"><b>{row.customerName}</b><p className="mt-0.5 font-mono text-xs text-slate-500">{row.id}</p></td><td className="px-5 py-4">{row.tipeCodeSnapshot}</td><td className="px-5 py-4">{rupiah(row.originalAmount)}</td><td className="px-5 py-4">{rupiah(row.paidAmount)}</td><td className="px-5 py-4">{rupiah(row.remainingAmount)}</td><td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(row.dueDate))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span></td><td className="px-5 py-4"><div className="flex gap-3"><Link href={`/tempo/${row.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">Detail</Link><Link href={`/print/tempo/${row.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">Cetak</Link></div></td></tr>)}{paged.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Tidak ada Tempo sesuai filter.</td></tr>}</tbody></table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm"><span className="text-slate-500">Halaman {page} dari {totalPages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, page - 1)}>Sebelumnya</Link>}{page < totalPages && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(params, page + 1)}>Berikutnya</Link>}</div></div>
      </section>
    </AppShell>
  );
}
