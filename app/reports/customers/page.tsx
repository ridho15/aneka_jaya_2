import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { listBookkeepingTypes } from "@/lib/business/masterData";
import {
  getCustomerSalesReport,
  type CustomerSortBy,
  type CustomerSortOrder
} from "@/lib/reports/customers";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  startDate?: string;
  endDate?: string;
  keyword?: string;
  tipe?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}>;

function buildPageHref(
  params: {
    startDate?: string;
    endDate?: string;
    keyword?: string;
    tipe?: string;
    sort?: string;
    pageSize?: string;
  },
  targetPage: number
) {
  const q = new URLSearchParams();
  if (params.startDate) q.set("startDate", params.startDate);
  if (params.endDate) q.set("endDate", params.endDate);
  if (params.keyword) q.set("keyword", params.keyword);
  if (params.tipe) q.set("tipe", params.tipe);
  if (params.sort && params.sort !== "omset_desc") q.set("sort", params.sort);
  if (params.pageSize && params.pageSize !== "25") q.set("pageSize", params.pageSize);
  if (targetPage > 1) q.set("page", String(targetPage));
  const qs = q.toString();
  return `/reports/customers${qs ? `?${qs}` : ""}`;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

export default async function CustomerReportsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view")) redirect("/");

  const params = await searchParams;
  const today = jakartaDateKey(new Date());
  const [year, month] = today.split("-");
  const defaultStart = `${year}-${month}-01`;

  const startDate = params?.startDate !== undefined ? params.startDate : defaultStart;
  const endDate = params?.endDate !== undefined ? params.endDate : today;
  const keyword = (params?.keyword || "").trim();
  const tipe = (params?.tipe || "").trim();
  const sortParam = params?.sort || "omset_desc";

  let sortBy: CustomerSortBy = "omset";
  let sortOrder: CustomerSortOrder = "desc";

  if (sortParam === "omset_asc") {
    sortBy = "omset";
    sortOrder = "asc";
  } else if (sortParam === "orders_desc") {
    sortBy = "orders";
    sortOrder = "desc";
  } else if (sortParam === "orders_asc") {
    sortBy = "orders";
    sortOrder = "asc";
  } else if (sortParam === "qty_desc") {
    sortBy = "qty";
    sortOrder = "desc";
  } else if (sortParam === "qty_asc") {
    sortBy = "qty";
    sortOrder = "asc";
  } else if (sortParam === "name_asc") {
    sortBy = "name";
    sortOrder = "asc";
  } else if (sortParam === "name_desc") {
    sortBy = "name";
    sortOrder = "desc";
  }

  const pageParam = parseInt(params?.page || "1", 10);
  const pageSizeParam = parseInt(params?.pageSize || "25", 10);
  const pageSize = [10, 25, 50, 100].includes(pageSizeParam) ? pageSizeParam : 25;
  const page = isNaN(pageParam) ? 1 : pageParam;

  const [report, tipeOptions] = await Promise.all([
    getCustomerSalesReport({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      keyword: keyword || undefined,
      tipe: tipe || undefined,
      sortBy,
      sortOrder,
      page,
      pageSize
    }),
    listBookkeepingTypes()
  ]);

  const activeTipes = tipeOptions
    .filter((t) => t.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  const filterState = {
    startDate,
    endDate,
    keyword,
    tipe,
    sort: sortParam,
    pageSize: String(pageSize)
  };

  const totalCustomers = report.summary.totalCustomers;
  const totalPages = report.meta.totalPages;
  const currentPage = report.meta.page;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCustomers);
  const fromRecord = totalCustomers === 0 ? 0 : startIndex + 1;
  const toRecord = endIndex;

  return (
    <AppShell>
      {/* Header & Breadcrumb */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href="/reports" className="hover:text-emerald-600">
              Laporan
            </Link>
            <span>/</span>
            <span className="text-slate-900">Pelanggan</span>
          </div>
          <h2 className="aj-page-title mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Laporan Pelanggan
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Rekapitulasi total belanja, kuantitas order, frekuensi transaksi, dan status piutang per pelanggan.
          </p>
        </div>

        {/* Tab Navigation Shortcuts */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-xs">
          <Link
            href="/reports"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            Harian
          </Link>
          <Link
            href="/reports/customers"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white shadow-xs"
          >
            Customer
          </Link>
          <Link
            href="/reports/products"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            Produk
          </Link>
          <Link
            href="/reports/stocks"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            Stok
          </Link>
          <Link
            href="/reports/finance"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            Finance
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Total Pelanggan Aktif
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 sm:text-3xl">
              {totalCustomers.toLocaleString("id-ID")}
            </span>
          </div>
          <span className="mt-3 text-xs text-slate-500">
            Total {report.summary.totalOrders.toLocaleString("id-ID")} transaksi terdata
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Total Omset Penjualan
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700 sm:text-3xl">
              {rupiah(report.summary.totalRevenue)}
            </span>
          </div>
          <span className="mt-3 text-xs text-slate-500">
            Rata-rata {rupiah(report.summary.averageRevenuePerCustomer)} per pelanggan
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Pelanggan Belanja Terbesar
          </span>
          <div className="mt-2 flex flex-col">
            <span className="truncate text-lg font-bold text-slate-900" title={report.summary.topSpender?.name}>
              {report.summary.topSpender?.name || "-"}
            </span>
            <span className="text-sm font-semibold text-emerald-700">
              {report.summary.topSpender ? rupiah(report.summary.topSpender.revenue) : "Rp 0"}
            </span>
          </div>
          <span className="mt-2 text-xs text-slate-500">
            Kontribusi omset tertinggi periode ini
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Paling Sering Belanja
          </span>
          <div className="mt-2 flex flex-col">
            <span className="truncate text-lg font-bold text-slate-900" title={report.summary.mostFrequent?.name}>
              {report.summary.mostFrequent?.name || "-"}
            </span>
            <span className="text-sm font-semibold text-slate-800">
              {report.summary.mostFrequent?.orders || 0} Kali Transaksi
            </span>
          </div>
          <span className="mt-2 text-xs text-slate-500">
            Frekuensi belanja terbanyak periode ini
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <form
        action="/reports/customers"
        method="GET"
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1.5 block">Dari Tanggal</span>
            <input
              type="date"
              name="startDate"
              defaultValue={startDate}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1.5 block">Sampai Tanggal</span>
            <input
              type="date"
              name="endDate"
              defaultValue={endDate}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1.5 block">Urutkan</span>
            <select
              name="sort"
              defaultValue={sortParam}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="omset_desc">Omset Terbanyak (Rp Tertinggi)</option>
              <option value="omset_asc">Omset Paling Sedikit (Rp Terendah)</option>
              <option value="orders_desc">Transaksi Terbanyak (Paling Sering)</option>
              <option value="orders_asc">Transaksi Paling Sedikit</option>
              <option value="qty_desc">Kuantitas Barang Terbanyak</option>
              <option value="qty_asc">Kuantitas Barang Paling Sedikit</option>
              <option value="name_asc">Nama Pelanggan (A - Z)</option>
              <option value="name_desc">Nama Pelanggan (Z - A)</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1.5 block">Cari Customer / Kota</span>
            <input
              type="text"
              name="keyword"
              defaultValue={keyword}
              placeholder="Contoh: Sensen / Bogor..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <div className="flex flex-col justify-end">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700"
              >
                Terapkan
              </button>
              <Link
                href="/reports/customers"
                className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </div>
        </div>

        {/* Tipe Pembukuan Filter Row */}
        {activeTipes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Tipe Pembukuan:</span>
            <Link
              href={buildPageHref({ ...filterState, tipe: "" }, 1)}
              className={`rounded-lg px-2.5 py-1 text-xs transition ${
                !tipe
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Semua Tipe
            </Link>
            {activeTipes.map((t) => (
              <Link
                key={t.id}
                href={buildPageHref({ ...filterState, tipe: t.code }, 1)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${
                  tipe === t.code
                    ? "bg-emerald-600 text-white font-bold shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t.code} ({t.name})
              </Link>
            ))}
          </div>
        )}
      </form>

      {/* Table Data */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 text-sm text-slate-600">
          <div>
            Menampilkan <strong className="text-slate-900">{fromRecord}–{toRecord}</strong> dari{" "}
            <strong className="text-slate-900">{totalCustomers}</strong> pelanggan
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3.5 text-center w-12">#</th>
                <th className="px-4 py-3.5">Nama Pelanggan</th>
                <th className="px-4 py-3.5">Wilayah / Lokasi</th>
                <th className="px-4 py-3.5 text-right">Total Belanja</th>
                <th className="px-4 py-3.5 text-right">Frekuensi</th>
                <th className="px-4 py-3.5 text-right">Total Qty</th>
                <th className="px-4 py-3.5 text-right">Rata-rata / Nota</th>
                <th className="px-4 py-3.5 text-center">Transaksi Terakhir</th>
                <th className="px-4 py-3.5 text-center">Status Piutang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {report.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Tidak ada transaksi pelanggan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                report.data.map((c, index) => {
                  const rank = startIndex + index + 1;
                  return (
                    <tr
                      key={c.customerKey}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-400">
                        {rank}
                      </td>

                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        <Link
                          href={`/penjualan?keyword=${encodeURIComponent(c.customerName)}`}
                          className="hover:text-emerald-600 hover:underline"
                          title="Lihat riwayat nota pelanggan ini"
                        >
                          {c.customerName}
                        </Link>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          {c.primaryLocation}
                          {c.locations.length > 1 && (
                            <span
                              className="text-[11px] text-slate-400"
                              title={c.locations.join(", ")}
                            >
                              (+{c.locations.length - 1})
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right font-black text-emerald-700">
                        {rupiah(c.totalRevenue)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                        {c.totalOrders.toLocaleString("id-ID")}{" "}
                        <span className="text-xs font-normal text-slate-500">nota</span>
                      </td>

                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                        {c.totalQuantity.toLocaleString("id-ID")}
                      </td>

                      <td className="px-4 py-3.5 text-right text-slate-600">
                        {rupiah(c.averageOrderValue)}
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-500">
                        {c.lastOrderDate}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {c.hasOpenTempo ? (
                          <span
                            className="inline-block rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700"
                            title={`Sisa piutang tempo: ${rupiah(c.openTempoBalance)}`}
                          >
                            {rupiah(c.openTempoBalance)}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Lunas
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Page Size Footer */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 px-5 py-3.5 text-xs sm:flex-row sm:text-sm">
          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              Menampilkan {fromRecord}–{toRecord} dari {totalCustomers} data (Halaman {currentPage} dari {totalPages})
            </span>
            <div className="hidden items-center gap-1 sm:flex text-xs">
              <span className="text-slate-400">| Tampilkan:</span>
              {[10, 25, 50, 100].map((sz) => (
                <Link
                  key={sz}
                  href={buildPageHref({ ...filterState, pageSize: String(sz) }, 1)}
                  className={`rounded-md px-2 py-0.5 font-semibold transition ${
                    pageSize === sz
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {sz}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {currentPage > 1 ? (
              <Link
                href={buildPageHref(filterState, currentPage - 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-emerald-700"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400">
                ← Sebelumnya
              </span>
            )}

            <span className="px-2 font-bold text-slate-700">
              {currentPage} / {totalPages}
            </span>

            {currentPage < totalPages ? (
              <Link
                href={buildPageHref(filterState, currentPage + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-emerald-700"
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
      </section>
    </AppShell>
  );
}
