import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import {
  listTempoReceivablesPage,
  listTempoTipeOptions,
  getTempoMetricsSummary,
  type TempoReceivableFilters
} from "@/lib/tempo/store";
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

function filterHref(baseParams: SearchParams, overrides: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  const currentTipe = valueOf(baseParams, "tipe");
  const currentKeyword = valueOf(baseParams, "keyword");
  if (currentTipe) next.set("tipe", currentTipe);
  if (currentKeyword) next.set("keyword", currentKeyword);

  for (const [key, val] of Object.entries(overrides)) {
    if (val) next.set(key, val);
  }
  const qs = next.toString();
  return qs ? `/tempo?${qs}` : "/tempo";
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
  if (status === "overdue") return "bg-rose-50 text-rose-700 border border-rose-200";
  if (status === "paid") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (status === "partial_paid") return "bg-amber-50 text-amber-700 border border-amber-200";
  if (["cancelled", "written_off"].includes(status)) return "bg-slate-100 text-slate-600 border border-slate-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

export default async function TempoPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const role = await getCurrentRole();
  if (!can(role, "tempo.view")) redirect("/");
  const params = await searchParams || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));
  const filters = filtersFromParams(params);
  const [{ data: paged, meta }, tipeOptions, metricsSummary] = await Promise.all([
    listTempoReceivablesPage({ page, pageSize: PAGE_SIZE, filters }),
    listTempoTipeOptions(),
    getTempoMetricsSummary(filters)
  ]);
  const totalPages = meta.totalPages;
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const activeFilters = activeFilterLabels(params);

  const currentStatus = valueOf(params, "status");
  const currentDueFrom = valueOf(params, "dueFrom");
  const currentDueTo = valueOf(params, "dueTo");
  const currentIncludeFinal = valueOf(params, "includeFinal") === "1";

  const isOverdueActive = currentStatus === "overdue";
  const isComingSoonActive =
    currentDueFrom === metricsSummary.comingSoonH3.fromDate &&
    currentDueTo === metricsSummary.comingSoonH3.toDate;
  const isBeyondActive =
    currentDueFrom === metricsSummary.beyondH3.fromDate && !currentDueTo;
  const isTotalActive =
    !isOverdueActive &&
    !isComingSoonActive &&
    !isBeyondActive &&
    !currentStatus &&
    !currentDueFrom &&
    !currentDueTo &&
    !currentIncludeFinal;

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Piutang</p>
        <h2 className="aj-page-title text-3xl font-bold">Tempo</h2>
        <p className="mt-2 text-sm text-slate-600">Default menampilkan open Tempo. Aktifkan final status untuk melihat paid, cancelled, atau written off.</p>
      </div>

      {/* 4 Summary Cards / Widgets */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Total Tempo Aktif */}
        <Link
          href={filterHref(params, { status: undefined, dueFrom: undefined, dueTo: undefined, includeFinal: undefined })}
          className={`group block rounded-2xl border p-5 shadow-xs transition-all hover:shadow-sm hover:border-slate-300 bg-white cursor-pointer ${
            isTotalActive ? "ring-2 ring-emerald-600 border-emerald-300" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Tempo Aktif
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
              {metricsSummary.total.count} Nota
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {rupiah(metricsSummary.total.amount)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Seluruh piutang berjalan</span>
            <span className="font-bold text-emerald-700 group-hover:underline">Semua</span>
          </div>
        </Link>

        {/* Card 2: Lewat Jatuh Tempo (Overdue) */}
        <Link
          href={filterHref(params, { status: "overdue", dueFrom: undefined, dueTo: undefined, includeFinal: undefined })}
          className={`group block rounded-2xl border p-5 shadow-xs transition-all hover:shadow-sm hover:border-rose-300 bg-rose-50/40 hover:bg-rose-50/70 cursor-pointer ${
            isOverdueActive ? "ring-2 ring-rose-600 border-rose-400" : "border-rose-200/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
              Lewat Jatuh Tempo
            </span>
            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
              {metricsSummary.overdue.count} Nota &bull; {metricsSummary.overdue.percentage}%
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-rose-700 sm:text-3xl">
            {rupiah(metricsSummary.overdue.amount)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-rose-600 font-medium">
            <span>Jatuh tempo terlampaui</span>
            <span className="font-bold group-hover:underline">Filter Overdue</span>
          </div>
        </Link>

        {/* Card 3: Jatuh Tempo Segera (H-3) */}
        <Link
          href={filterHref(params, {
            status: undefined,
            dueFrom: metricsSummary.comingSoonH3.fromDate,
            dueTo: metricsSummary.comingSoonH3.toDate,
            includeFinal: undefined
          })}
          className={`group block rounded-2xl border p-5 shadow-xs transition-all hover:shadow-sm hover:border-amber-300 bg-amber-50/40 hover:bg-amber-50/70 cursor-pointer ${
            isComingSoonActive ? "ring-2 ring-amber-600 border-amber-400" : "border-amber-200/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Jatuh Tempo Segera (H-3)
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
              {metricsSummary.comingSoonH3.count} Nota &bull; {metricsSummary.comingSoonH3.percentage}%
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-800 sm:text-3xl">
            {rupiah(metricsSummary.comingSoonH3.amount)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-amber-700 font-medium">
            <span>Hari ini s/d 3 hari ke depan</span>
            <span className="font-bold group-hover:underline">Filter H-3</span>
          </div>
        </Link>

        {/* Card 4: Jatuh Tempo Aman (> H-3) */}
        <Link
          href={filterHref(params, {
            status: undefined,
            dueFrom: metricsSummary.beyondH3.fromDate,
            dueTo: undefined,
            includeFinal: undefined
          })}
          className={`group block rounded-2xl border p-5 shadow-xs transition-all hover:shadow-sm hover:border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/60 cursor-pointer ${
            isBeyondActive ? "ring-2 ring-emerald-600 border-emerald-400" : "border-emerald-200/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
              Jatuh Tempo Aman (&gt; H-3)
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {metricsSummary.beyondH3.count} Nota &bull; {metricsSummary.beyondH3.percentage}%
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700 sm:text-3xl">
            {rupiah(metricsSummary.beyondH3.amount)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Lebih dari 3 hari lagi</span>
            <span className="font-bold group-hover:underline">Filter &gt; H-3</span>
          </div>
        </Link>
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
            <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{row.customerName}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{row.id}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(row.status)}`}>{row.status}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Remaining</dt><dd className="mt-0.5 font-bold text-slate-900">{rupiah(row.remainingAmount)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Jatuh Tempo</dt><dd className="mt-0.5 text-slate-700">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(row.dueDate))}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Original</dt><dd className="mt-0.5 text-slate-700">{rupiah(row.originalAmount)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</dt><dd className="mt-0.5 text-slate-700">{rupiah(row.paidAmount)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {!["paid", "cancelled", "written_off"].includes(row.status) ? (
                  <Link href={`/tempo/${row.id}`} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors">Bayar</Link>
                ) : (
                  <Link href={`/tempo/${row.id}`} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Detail</Link>
                )}
                <Link href={`/print/tempo/${row.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Cetak</Link>
              </div>
            </article>
          ))}
          {paged.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada Tempo sesuai filter.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Original</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Remaining</th><th className="px-5 py-3">Jatuh Tempo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{paged.map((row) => <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"><td className="px-5 py-4"><b>{row.customerName}</b><p className="mt-0.5 font-mono text-xs text-slate-500">{row.id}</p></td><td className="px-5 py-4"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{row.tipeCodeSnapshot}</span></td><td className="px-5 py-4 font-medium">{rupiah(row.originalAmount)}</td><td className="px-5 py-4 font-medium text-emerald-700">{rupiah(row.paidAmount)}</td><td className="px-5 py-4 font-bold text-slate-900">{rupiah(row.remainingAmount)}</td><td className="px-5 py-4 text-slate-600">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" }).format(new Date(row.dueDate))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(row.status)}`}>{row.status}</span></td><td className="px-5 py-4"><div className="flex items-center gap-2">{!["paid", "cancelled", "written_off"].includes(row.status) ? (<Link href={`/tempo/${row.id}`} className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors">Bayar</Link>) : (<Link href={`/tempo/${row.id}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Detail</Link>)}<Link href={`/print/tempo/${row.id}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Cetak</Link></div></td></tr>)}{paged.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Tidak ada Tempo sesuai filter.</td></tr>}</tbody></table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm"><span className="text-slate-500">Halaman {page} dari {totalPages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50" href={pageHref(params, page - 1)}>Sebelumnya</Link>}{page < totalPages && <Link className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50" href={pageHref(params, page + 1)}>Berikutnya</Link>}</div></div>
      </section>
    </AppShell>
  );
}
