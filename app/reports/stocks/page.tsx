import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getStockInventoryReport } from "@/lib/reports/stockReports";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  warehouse?: string;
  keyword?: string;
  sku?: string;
  status?: string;
}>;

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default async function StockReportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const role = await getCurrentRole();
  if (!can(role, "stock.view") && !can(role, "reports.view")) redirect("/");

  const params = await searchParams;
  const warehouse = params?.warehouse || "";
  const keyword = params?.keyword || "";
  const sku = params?.sku || "";
  const status = (params?.status as any) || "all";

  const report = await getStockInventoryReport({
    warehouse,
    productKeyword: keyword,
    sku,
    status,
  });

  const exportExcelUrl = `/api/reports/stocks?warehouse=${encodeURIComponent(
    warehouse,
  )}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}${
    sku ? `&sku=${encodeURIComponent(sku)}` : ""
  }&status=${encodeURIComponent(status)}&format=excel`;

  const printPdfUrl = `/reports/stocks/print?warehouse=${encodeURIComponent(
    warehouse,
  )}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}${
    sku ? `&sku=${encodeURIComponent(sku)}` : ""
  }&status=${encodeURIComponent(status)}`;

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
            <span className="text-slate-900">Stok & Persediaan</span>
          </div>
          <h2 className="aj-page-title mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Laporan Persediaan Stok Barang
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Audit kuantitas fisik persediaan, valuasi total nilai aset stok modal,
            dan status stok di bawah minimum.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {role === "OWNER" && (
            <Link
              href="/stok-barang/ai-forecast"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 sm:text-sm"
            >
              <span>Prediksi Stok</span>
            </Link>
          )}

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
            <span className="mb-1 block">Pilih Lokasi Gudang</span>
            <select
              name="warehouse"
              defaultValue={warehouse}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Semua Gudang</option>
              {report.warehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1 block">Status Stok</span>
            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Semua Status</option>
              <option value="warning">Menipis (Di Bawah Minimum)</option>
              <option value="out_of_stock">Habis (Qty 0)</option>
              <option value="safe">Aman</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700 sm:text-sm">
            <span className="mb-1 block">Cari Nama / SKU Barang</span>
            <input
              type="text"
              name="keyword"
              defaultValue={keyword}
              placeholder="Contoh: BRG-001 / Benang..."
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
            {(keyword || warehouse || status !== "all") && (
              <Link
                href="/reports/stocks"
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
            Total Valuasi Aset Stok
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {report.summary.totalCostValuation > 0
              ? rupiah(report.summary.totalCostValuation)
              : "-"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Berdasarkan harga modal</p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Kuantitas Fisik
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {report.summary.totalQuantity.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-xs text-slate-500">Unit barang di gudang</p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Varian Item Stok
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {report.summary.totalItems.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-xs text-slate-500">Total baris data stok</p>
        </section>

        <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Status Perhatian Stok
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              {report.summary.warningCount} Menipis
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-rose-700">
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              {report.summary.outOfStockCount} Habis
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {report.summary.safeCount} item dalam kondisi aman
          </p>
        </section>
      </div>

      {/* Main Data Table */}
      <section className="aj-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="font-bold text-slate-900">
              Daftar Posisi &amp; Valuasi Stok
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Menampilkan {report.items.length} item stok persediaan.
            </p>
          </div>
        </div>

        {/* Mobile View */}
        <div className="divide-y divide-slate-100 md:hidden">
          {report.items.map((item, idx) => (
            <article key={`${item.sku}-${item.warehouse}-${idx}`} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                      {item.sku}
                    </span>
                    {item.status === "out_of_stock" && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        Habis
                      </span>
                    )}
                    {item.status === "warning" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Menipis
                      </span>
                    )}
                    {item.status === "safe" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Aman
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{item.productName}</p>
                  <p className="text-xs text-slate-500">
                    {item.warehouse} • Rak: {item.rack}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900">
                    {item.quantity.toLocaleString("id-ID")} {item.unit}
                  </p>
                  <p className="text-xs text-slate-500">
                    Min: {item.minStock}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2 text-xs text-slate-600">
                <span>
                  Modal: {item.costPrice > 0 ? rupiah(item.costPrice) : "-"}
                </span>
                <span>
                  Valuasi:{" "}
                  <b>
                    {item.totalCostValuation > 0
                      ? rupiah(item.totalCostValuation)
                      : "-"}
                  </b>
                </span>
              </div>
            </article>
          ))}

          {report.items.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              Tidak ada data stok yang cocok dengan filter yang dipilih.
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
                <th className="px-5 py-3.5">Gudang / Rak</th>
                <th className="px-5 py-3.5 text-right">Qty Fisik</th>
                <th className="px-5 py-3.5 text-right">Min Stok</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Harga Modal</th>
                <th className="px-5 py-3.5 text-right">Valuasi Aset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.items.map((item, index) => (
                <tr key={`${item.sku}-${item.warehouse}-${index}`} className="hover:bg-slate-50/75">
                  <td className="px-5 py-4 text-center font-mono text-xs text-slate-500">
                    {index + 1}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs font-bold text-slate-800">
                    {item.sku}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {item.productName}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {item.warehouse} <span className="text-slate-400">({item.rack})</span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">
                    {item.quantity.toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-xs text-slate-600">
                    {item.minStock.toLocaleString("id-ID")}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {item.status === "out_of_stock" && (
                      <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                        Habis
                      </span>
                    )}
                    {item.status === "warning" && (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        Menipis
                      </span>
                    )}
                    {item.status === "safe" && (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        Aman
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-xs text-slate-700">
                    {item.costPrice > 0 ? (
                      rupiah(item.costPrice)
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">
                    {item.totalCostValuation > 0 ? (
                      rupiah(item.totalCostValuation)
                    ) : (
                      <span className="font-normal text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}

              {report.items.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    Tidak ada data persediaan stok yang cocok dengan filter yang
                    dipilih.
                  </td>
                </tr>
              )}
            </tbody>
            {report.items.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-center uppercase tracking-wider">
                    Total Persediaan
                  </td>
                  <td className="px-5 py-4 text-right text-base text-emerald-800">
                    {report.summary.totalQuantity.toLocaleString("id-ID")}
                  </td>
                  <td colSpan={3} className="px-5 py-4 text-right text-xs text-slate-500">
                    {report.summary.totalItems} Baris Item
                  </td>
                  <td className="px-5 py-4 text-right text-base text-emerald-800">
                    {report.summary.totalCostValuation > 0
                      ? rupiah(report.summary.totalCostValuation)
                      : "-"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </AppShell>
  );
}
