import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { getProductSalesReport } from "@/lib/reports/productReports";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  startDate?: string;
  endDate?: string;
  keyword?: string;
  sku?: string;
  page?: string;
  pageSize?: string;
}>;

function buildPageHref(
  params: {
    startDate?: string;
    endDate?: string;
    keyword?: string;
    sku?: string;
    pageSize?: string;
  },
  targetPage: number,
) {
  const q = new URLSearchParams();
  if (params.startDate) q.set("startDate", params.startDate);
  if (params.endDate) q.set("endDate", params.endDate);
  if (params.keyword) q.set("keyword", params.keyword);
  if (params.sku) q.set("sku", params.sku);
  if (params.pageSize && params.pageSize !== "25") q.set("pageSize", params.pageSize);
  if (targetPage > 1) q.set("page", String(targetPage));
  const qs = q.toString();
  return `/reports/products${qs ? `?${qs}` : ""}`;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default async function ProductReportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view")) redirect("/");

  const params = await searchParams;
  const today = jakartaDateKey(new Date());
  const [year, month] = today.split("-");
  const defaultStart = `${year}-${month}-01`;

  const startDate = params?.startDate || defaultStart;
  const endDate = params?.endDate || today;
  const keyword = params?.keyword || "";
  const sku = params?.sku || "";

  const report = await getProductSalesReport({
    startDate,
    endDate,
    productKeyword: keyword,
    sku,
  });

  const pageParam = parseInt(params?.page || "1", 10);
  const pageSizeParam = parseInt(params?.pageSize || "25", 10);
  const pageSize = [10, 25, 50, 100].includes(pageSizeParam) ? pageSizeParam : 25;
  const totalItems = report.items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, isNaN(pageParam) ? 1 : pageParam), totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pagedItems = report.items.slice(startIndex, endIndex);

  const filterState = {
    startDate,
    endDate,
    keyword,
    sku,
    pageSize: String(pageSize),
  };

  const exportExcelUrl = `/api/reports/products?startDate=${encodeURIComponent(
    startDate,
  )}&endDate=${encodeURIComponent(endDate)}${
    keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""
  }${sku ? `&sku=${encodeURIComponent(sku)}` : ""}&format=excel`;

  const printPdfUrl = `/reports/products/print?startDate=${encodeURIComponent(
    startDate,
  )}&endDate=${encodeURIComponent(endDate)}${
    keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""
  }${sku ? `&sku=${encodeURIComponent(sku)}` : ""}`;

  return (
    <AppShell>
      {/* Header & Quick Action */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href="/reports" className="hover:text-emerald-600">
              Laporan
            </Link>
            <span>/</span>
            <span className="text-slate-900">Produk & Penjualan</span>
          </div>
          <h2 className="aj-page-title mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Laporan Penjualan Produk
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Rekap mutasi penjualan, kuantitas terjual, dan total omset per produk
            berdasarkan rentang tanggal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-xs">
            <Link href="/reports" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Harian</Link>
            <Link href="/reports/customers" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Customer</Link>
            <Link href="/reports/products" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white shadow-xs">Produk</Link>
            <Link href="/reports/stocks" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Stok</Link>
            <Link href="/reports/finance" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900">Finance</Link>
          </div>
          <a
            href={exportExcelUrl}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-100 sm:text-sm"
          >
            <svg
              className="h-4 w-4 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Unduh Excel
          </a>

          <a
            href={printPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 sm:text-sm"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Cetak / PDF
          </a>
        </div>
      </div>

      {/* Filter Bar */}
      <form
        method="GET"
        className="aj-surface mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1 block">Dari Tanggal</span>
            <input
              type="date"
              name="startDate"
              defaultValue={startDate}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1 block">Sampai Tanggal</span>
            <input
              type="date"
              name="endDate"
              defaultValue={endDate}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1 block">Cari Produk / SKU</span>
            <input
              type="text"
              name="keyword"
              defaultValue={keyword}
              placeholder="Contoh: BRG-001 / Kain..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700"
            >
              Terapkan Filter
            </button>
            {(keyword || startDate !== defaultStart || endDate !== today) && (
              <Link
                href="/reports/products"
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                title="Reset Filter"
              >
                Reset
              </Link>
            )}
          </div>
        </div>
      </form>

      {/* KPI Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Omset Penjualan
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {rupiah(report.summary.totalOmset)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Periode: {startDate} s/d {endDate}
          </p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Kuantitas Terjual
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {report.summary.totalQuantity.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-xs text-slate-500">Total unit fisik keluar</p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Varian Produk Terjual
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {report.summary.uniqueProductsCount.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Jenis barang yang bertransaksi
          </p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Produk Terlaris (Top Omset)
          </p>
          <p className="mt-2 truncate text-base font-bold text-emerald-700 sm:text-lg">
            {report.summary.topProduct
              ? report.summary.topProduct.name
              : "-"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {report.summary.topProduct
              ? `${rupiah(report.summary.topProduct.totalOmset)} (${report.summary.topProduct.totalQuantity} ${report.summary.topProduct.unit})`
              : "Belum ada transaksi"}
          </p>
        </section>
      </div>

      {/* Main Data Table */}
      <section className="aj-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="font-bold text-slate-900">
              Daftar Penjualan per Produk
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Menampilkan {totalItems === 0 ? "0" : `${startIndex + 1} - ${endIndex}`} dari {totalItems} produk yang terjual dalam periode ini.
            </p>
          </div>
          {totalItems > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-500">Baris:</span>
              {[25, 50, 100].map((size) => (
                <Link
                  key={size}
                  href={buildPageHref({ ...filterState, pageSize: String(size) }, 1)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    pageSize === size
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {size}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Mobile View */}
        <div className="divide-y divide-slate-100 md:hidden">
          {pagedItems.map((item, idx) => (
            <article key={item.productRef} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                    {item.code}
                  </span>
                  <p className="mt-1 font-semibold text-slate-900">{item.name}</p>
                </div>
                <p className="shrink-0 text-right font-black text-slate-900">
                  {rupiah(item.totalOmset)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-2 text-xs text-slate-600">
                <span>
                  Terjual: <b>{item.totalQuantity} {item.unit}</b> ({item.transactionCount} trx)
                </span>
                <span>
                  Rata-rata: <b>{rupiah(item.avgPrice)}</b>
                </span>
              </div>
            </article>
          ))}

          {pagedItems.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              Tidak ada data penjualan produk pada rentang tanggal yang dipilih.
            </div>
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-5 py-3.5 text-center">No</th>
                <th className="px-5 py-3.5">Kode SKU</th>
                <th className="px-5 py-3.5">Nama Barang</th>
                <th className="px-5 py-3.5 text-right">Qty Terjual</th>
                <th className="px-5 py-3.5 text-center">Satuan</th>
                <th className="px-5 py-3.5 text-right">Jml Transaksi</th>
                <th className="px-5 py-3.5 text-right">Rata-rata Harga</th>
                <th className="px-5 py-3.5 text-right">Total Omset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedItems.map((item, index) => (
                <tr key={item.productRef} className="hover:bg-slate-50/75">
                  <td className="px-5 py-4 text-center font-mono text-xs text-slate-500">
                    {startIndex + index + 1}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs font-bold text-slate-800">
                    {item.code}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {item.name}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-slate-900">
                    {item.totalQuantity.toLocaleString("id-ID")}
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-600">
                    {item.unit}
                  </td>
                  <td className="px-5 py-4 text-right text-xs text-slate-600">
                    {item.transactionCount}
                  </td>
                  <td className="px-5 py-4 text-right text-xs text-slate-700">
                    {rupiah(item.avgPrice)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">
                    {rupiah(item.totalOmset)}
                  </td>
                </tr>
              ))}

              {pagedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    Tidak ada data penjualan produk pada rentang tanggal yang
                    dipilih.
                  </td>
                </tr>
              )}
            </tbody>
            {report.items.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="px-5 py-4 text-center uppercase tracking-wider">
                    Total Keseluruhan (Semua {report.summary.uniqueProductsCount} Produk)
                  </td>
                  <td className="px-5 py-4 text-right text-base text-emerald-800">
                    {report.summary.totalQuantity.toLocaleString("id-ID")}
                  </td>
                  <td colSpan={3} className="px-5 py-4 text-right text-xs text-slate-500">
                    {report.summary.totalTransactionsCount} Total Item Transaksi
                  </td>
                  <td className="px-5 py-4 text-right text-base text-emerald-800">
                    {rupiah(report.summary.totalOmset)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Controls Footer */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-slate-600 sm:text-sm">
            <div>
              <span>
                Menampilkan <b className="text-slate-900">{startIndex + 1}</b> -{" "}
                <b className="text-slate-900">{endIndex}</b> dari{" "}
                <b className="text-slate-900">{totalItems}</b> produk (Halaman {page} dari {totalPages})
              </span>
            </div>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  href={buildPageHref(filterState, page - 1)}
                >
                  Sebelumnya
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-1.5 font-semibold text-slate-400">
                  Sebelumnya
                </span>
              )}
              {page < totalPages ? (
                <Link
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  href={buildPageHref(filterState, page + 1)}
                >
                  Berikutnya
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-1.5 font-semibold text-slate-400">
                  Berikutnya
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
