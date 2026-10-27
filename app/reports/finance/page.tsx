import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listBookkeepingTypes, listRekeningAccounts, type RekeningAccount } from "@/lib/business/masterData";
import { jakartaMonthFromKey } from "@/lib/date/jakarta";
import { getFinanceReport } from "@/lib/reports/store";

import {
  FINANCE_PAGE_SIZE,
  filterApprovedExpenses,
  filterOpenTempo,
  pageHref,
  paginateItems,
  resetExpenseFilterHref,
  resetTempoFilterHref,
  toPage,
  valueOf,
  type SearchParams,
} from "@/lib/reports/financeFilters";

export const dynamic = "force-dynamic";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function rekeningLabel(rekening: Pick<RekeningAccount, "bank" | "name">) {
  return rekening.bank && rekening.bank !== rekening.name
    ? `${rekening.name} - ${rekening.bank}`
    : rekening.name;
}

function tempoStatusBadge(status: string) {
  switch (status) {
    case "overdue":
      return (
        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
          Overdue
        </span>
      );
    case "partial_paid":
      return (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Partial Paid
        </span>
      );
    case "open":
      return (
        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
          Open
        </span>
      );
    default:
      return (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {status}
        </span>
      );
  }
}

function Pagination({
  current,
  totalPages,
  totalItems,
  pageSize,
  hrefFor,
}: {
  current: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  if (totalItems <= pageSize && current === 1) return null;

  const from = totalItems === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs sm:flex-row sm:text-sm">
      <span className="text-slate-500">
        Menampilkan {from}–{to} dari {totalItems} data (Halaman {current} dari {totalPages})
      </span>
      <div className="flex items-center gap-1.5">
        {current > 1 ? (
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-emerald-700"
            href={hrefFor(current - 1)}
          >
            ← Sebelumnya
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400">
            ← Sebelumnya
          </span>
        )}
        <span className="px-2 font-bold text-slate-700">
          {current} / {totalPages}
        </span>
        {current < totalPages ? (
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-emerald-700"
            href={hrefFor(current + 1)}
          >
            Berikutnya →
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400">
            Berikutnya →
          </span>
        )}
      </div>
    </div>
  );
}

export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const role = await getCurrentRole();
  if (!can(role, "reports.finance_view")) redirect("/");

  const params = (await searchParams) || {};
  const month = jakartaMonthFromKey(valueOf(params, "month"));

  // Fetch report data and master data
  const [summary, tipeOptions, rekeningOptions] = await Promise.all([
    getFinanceReport(month),
    listBookkeepingTypes(),
    listRekeningAccounts(),
  ]);

  const activeTipeOptions = tipeOptions
    .filter((item) => item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  const activeRekeningOptions = rekeningOptions
    .filter((item) => item.isActive !== false)
    .sort((a, b) => rekeningLabel(a).localeCompare(rekeningLabel(b)));

  // Parameter filter & pagination Open Tempo
  const tempoKeywordRaw = valueOf(params, "tempoKeyword") || "";
  const tempoTipe = valueOf(params, "tempoTipe") || "";
  const tempoStatus = valueOf(params, "tempoStatus") || "";
  const tempoPage = toPage(valueOf(params, "tempoPage"));
  const isTempoFiltered = Boolean(tempoKeywordRaw.trim() || tempoTipe || tempoStatus);

  // Filter & Pagination Open Tempo
  const filteredTempo = filterOpenTempo(summary.openTempo, {
    keyword: tempoKeywordRaw,
    tipe: tempoTipe,
    status: tempoStatus,
  });
  const {
    items: pagedTempo,
    currentPage: currentTempoPage,
    totalPages: tempoTotalPages,
  } = paginateItems(filteredTempo, tempoPage, FINANCE_PAGE_SIZE);

  // Parameter filter & pagination Pengeluaran
  const expenseKeywordRaw = valueOf(params, "expenseKeyword") || "";
  const expenseTipe = valueOf(params, "expenseTipe") || "";
  const expenseRekening = valueOf(params, "expenseRekening") || "";
  const expensePage = toPage(valueOf(params, "expensePage"));
  const isExpenseFiltered = Boolean(
    expenseKeywordRaw.trim() || expenseTipe || expenseRekening,
  );

  // Filter & Pagination Pengeluaran
  const filteredExpenses = filterApprovedExpenses(summary.approvedExpenses, {
    keyword: expenseKeywordRaw,
    tipe: expenseTipe,
    rekening: expenseRekening,
  });
  const {
    items: pagedExpenses,
    currentPage: currentExpensePage,
    totalPages: expenseTotalPages,
  } = paginateItems(filteredExpenses, expensePage, FINANCE_PAGE_SIZE);

  return (
    <AppShell>
      {/* Header Halaman */}
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="aj-page-title text-3xl font-bold">Laporan Finance</h2>
          <p className="mt-2 text-sm text-slate-600">
            Ringkasan Tempo, pembayaran, dan pengeluaran approved dari PostgreSQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/reports/finance?month=${encodeURIComponent(month)}&format=excel`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 sm:text-sm"
          >
            Unduh Excel
          </a>
          <a
            href={`/reports/finance/print?month=${encodeURIComponent(month)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 sm:text-sm"
          >
            Cetak / PDF
          </a>
        </div>
      </div>

      {/* Master Filter Periode Bulan */}
      <form
        method="GET"
        action="/reports/finance"
        className="aj-surface mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <label className="text-sm font-semibold text-slate-700">
          <span className="mb-1 block">Bulan laporan</span>
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 sm:w-auto"
            type="month"
            name="month"
            defaultValue={month}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700"
        >
          Terapkan
        </button>
      </form>

      {/* Stat Cards Ringkasan Eksekutif */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Open Tempo saat ini</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {rupiah(summary.openTempoTotal)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {summary.openTempo.length} piutang aktif. Tidak mengikuti filter bulan.
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pembayaran Tempo bulan ini</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">
            {rupiah(summary.tempoPaymentTotal)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {summary.tempoPayments.length} pembayaran ({summary.tempoReversals.length} reversal: {rupiah(summary.tempoReversalTotal)}).
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Beban Operasional bulan ini</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {rupiah(summary.operationalExpenseTotal ?? summary.approvedExpenseTotal)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Beban usaha operasional perusahaan (beban laba rugi).
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kasbon Karyawan Dicairkan</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {rupiah(summary.kasbonDisbursedTotal ?? 0)}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">Aset Piutang</span>
            <Link href="/sdm/kasbon" className="font-semibold text-emerald-700 hover:underline">
              SDM Kasbon →
            </Link>
          </div>
        </section>
      </div>

      {/* Section 1: Open Tempo Saat Ini */}
      <section className="aj-surface mt-6 overflow-hidden">
        {/* Header Section */}
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900">Open Tempo saat ini</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Daftar piutang aktif berjalan (status: open, overdue, partial_paid).
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Menampilkan <span className="font-bold text-slate-800">{pagedTempo.length}</span>{" "}
            dari <span className="font-bold text-slate-800">{filteredTempo.length}</span> data
            {isTempoFiltered && (
              <span className="text-slate-400">
                {" "}
                (difilter dari total {summary.openTempo.length})
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Pencarian & Filter Open Tempo */}
        <form
          method="GET"
          action="/reports/finance"
          className="border-b border-slate-100 bg-slate-50/50 p-4"
        >
          <input type="hidden" name="month" value={month} />
          {expenseKeywordRaw && (
            <input type="hidden" name="expenseKeyword" value={expenseKeywordRaw} />
          )}
          {expenseTipe && <input type="hidden" name="expenseTipe" value={expenseTipe} />}
          {expenseRekening && (
            <input type="hidden" name="expenseRekening" value={expenseRekening} />
          )}
          {expensePage > 1 && (
            <input type="hidden" name="expensePage" value={String(expensePage)} />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Pencarian Customer
              </label>
              <Input
                type="search"
                name="tempoKeyword"
                defaultValue={tempoKeywordRaw}
                placeholder="Nama customer / sales ID..."
                className="rounded-lg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Tipe Pembukuan
              </label>
              <Select name="tempoTipe" defaultValue={tempoTipe} className="rounded-lg">
                <option value="">Semua Tipe</option>
                {activeTipeOptions.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Status Piutang
              </label>
              <Select name="tempoStatus" defaultValue={tempoStatus} className="rounded-lg">
                <option value="">Semua Status Aktif</option>
                <option value="open">Open (Belum Bayar)</option>
                <option value="overdue">Overdue (Jatuh Tempo)</option>
                <option value="partial_paid">Partial Paid (Dicicil)</option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-[38px] flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700"
              >
                Terapkan
              </button>
              {isTempoFiltered && (
                <Link
                  href={resetTempoFilterHref(params)}
                  className="inline-flex h-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Reset
                </Link>
              )}
            </div>
          </div>
        </form>

        {/* Mobile Cards (Test ID dipertahankan untuk Playwright) */}
        <div data-testid="finance-tempo-mobile-cards" className="space-y-3 p-4 md:hidden">
          {pagedTempo.map((row) => (
            <article
              key={row.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{row.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{row.tipeCodeSnapshot}</span>{" "}
                    • Jatuh tempo {row.dueDate}
                  </p>
                </div>
                <div>{tempoStatusBadge(row.status)}</div>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">Sisa Piutang</span>
                <p className="text-base font-bold text-slate-900">{rupiah(row.remainingAmount)}</p>
              </div>
            </article>
          ))}
          {pagedTempo.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-600">
                {isTempoFiltered
                  ? "Tidak ada open Tempo yang cocok dengan kriteria pencarian/filter."
                  : "Tidak ada open Tempo saat ini."}
              </p>
              {isTempoFiltered && (
                <Link
                  href={resetTempoFilterHref(params)}
                  className="mt-2 inline-block text-xs font-semibold text-emerald-600 underline"
                >
                  Bersihkan filter
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Tipe</th>
                <th className="px-5 py-3.5">Jatuh tempo</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Sisa Piutang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedTempo.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{row.customerName}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {row.tipeCodeSnapshot}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{row.dueDate}</td>
                  <td className="px-5 py-3.5">{tempoStatusBadge(row.status)}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                    {rupiah(row.remainingAmount)}
                  </td>
                </tr>
              ))}
              {pagedTempo.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    <p className="font-medium">
                      {isTempoFiltered
                        ? "Tidak ada open Tempo yang cocok dengan kriteria pencarian/filter."
                        : "Tidak ada open Tempo saat ini."}
                    </p>
                    {isTempoFiltered && (
                      <Link
                        href={resetTempoFilterHref(params)}
                        className="mt-2 inline-block text-xs font-semibold text-emerald-600 underline"
                      >
                        Bersihkan filter
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Open Tempo */}
        <Pagination
          current={currentTempoPage}
          totalPages={tempoTotalPages}
          totalItems={filteredTempo.length}
          pageSize={FINANCE_PAGE_SIZE}
          hrefFor={(page) => pageHref(params, "tempoPage", page)}
        />
      </section>

      {/* Section 2: Pengeluaran Approved */}
      <section className="aj-surface mt-6 overflow-hidden">
        {/* Header Section */}
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Pengeluaran approved {month}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Daftar seluruh pengeluaran operasional yang telah disetujui pada periode bulan ini.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Menampilkan <span className="font-bold text-slate-800">{pagedExpenses.length}</span>{" "}
            dari <span className="font-bold text-slate-800">{filteredExpenses.length}</span> data
            {isExpenseFiltered && (
              <span className="text-slate-400">
                {" "}
                (difilter dari total {summary.approvedExpenses.length})
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Pencarian & Filter Pengeluaran */}
        <form
          method="GET"
          action="/reports/finance"
          className="border-b border-slate-100 bg-slate-50/50 p-4"
        >
          <input type="hidden" name="month" value={month} />
          {tempoKeywordRaw && (
            <input type="hidden" name="tempoKeyword" value={tempoKeywordRaw} />
          )}
          {tempoTipe && <input type="hidden" name="tempoTipe" value={tempoTipe} />}
          {tempoStatus && <input type="hidden" name="tempoStatus" value={tempoStatus} />}
          {tempoPage > 1 && (
            <input type="hidden" name="tempoPage" value={String(tempoPage)} />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Pencarian Vendor / Catatan
              </label>
              <Input
                type="search"
                name="expenseKeyword"
                defaultValue={expenseKeywordRaw}
                placeholder="Nama vendor, catatan, kategori..."
                className="rounded-lg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Tipe Pembukuan
              </label>
              <Select name="expenseTipe" defaultValue={expenseTipe} className="rounded-lg">
                <option value="">Semua Tipe</option>
                {activeTipeOptions.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Rekening Kas / Bank
              </label>
              <Select
                name="expenseRekening"
                defaultValue={expenseRekening}
                className="rounded-lg"
              >
                <option value="">Semua Rekening</option>
                {activeRekeningOptions.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name} {item.bank && item.bank !== item.name ? `(${item.bank})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-[38px] flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700"
              >
                Terapkan
              </button>
              {isExpenseFiltered && (
                <Link
                  href={resetExpenseFilterHref(params)}
                  className="inline-flex h-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Reset
                </Link>
              )}
            </div>
          </div>
        </form>

        {/* Mobile Cards (Test ID dipertahankan untuk Playwright) */}
        <div data-testid="finance-expense-mobile-cards" className="space-y-3 p-4 md:hidden">
          {pagedExpenses.map((row) => (
            <article
              key={row.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.vendorName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.expenseDate} •{" "}
                    <span className="font-medium text-slate-700">{row.tipeCodeSnapshot}</span>{" "}
                    • {row.category}
                  </p>
                </div>
                <p className="shrink-0 text-base font-bold text-slate-900">{rupiah(row.amount)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                <span>Rekening:</span>
                <span className="font-medium text-slate-800">{row.rekeningNameSnapshot}</span>
              </div>
              {(row.notes || row.description) && (
                <p className="mt-1.5 text-xs text-slate-500 italic">
                  Catatan: {row.notes || row.description}
                </p>
              )}
            </article>
          ))}
          {pagedExpenses.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-600">
                {isExpenseFiltered
                  ? "Tidak ada pengeluaran yang cocok dengan kriteria pencarian/filter."
                  : "Tidak ada pengeluaran approved pada bulan ini."}
              </p>
              {isExpenseFiltered && (
                <Link
                  href={resetExpenseFilterHref(params)}
                  className="mt-2 inline-block text-xs font-semibold text-emerald-600 underline"
                >
                  Bersihkan filter
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5">Tipe</th>
                <th className="px-5 py-3.5">Rekening</th>
                <th className="px-5 py-3.5">Kategori</th>
                <th className="px-5 py-3.5">Vendor</th>
                <th className="px-5 py-3.5">Catatan</th>
                <th className="px-5 py-3.5 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedExpenses.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 text-slate-600">{row.expenseDate}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {row.tipeCodeSnapshot}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-700">{row.rekeningNameSnapshot}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {row.category}
                    </span>
                    {row.categoryCode === "employee_loan" && (
                      <span className="ml-1 inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        Piutang
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{row.vendorName}</td>
                  <td className="px-5 py-3.5 max-w-xs truncate text-xs text-slate-500">
                    {row.notes || row.description || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                    {rupiah(row.amount)}
                  </td>
                </tr>
              ))}
              {pagedExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    <p className="font-medium">
                      {isExpenseFiltered
                        ? "Tidak ada pengeluaran yang cocok dengan kriteria pencarian/filter."
                        : "Tidak ada pengeluaran approved pada bulan ini."}
                    </p>
                    {isExpenseFiltered && (
                      <Link
                        href={resetExpenseFilterHref(params)}
                        className="mt-2 inline-block text-xs font-semibold text-emerald-600 underline"
                      >
                        Bersihkan filter
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Pengeluaran */}
        <Pagination
          current={currentExpensePage}
          totalPages={expenseTotalPages}
          totalItems={filteredExpenses.length}
          pageSize={FINANCE_PAGE_SIZE}
          hrefFor={(page) => pageHref(params, "expensePage", page)}
        />
      </section>
    </AppShell>
  );
}

