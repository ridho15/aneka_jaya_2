import { redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getStockInventoryReport } from "@/lib/reports/stockReports";
import { PrintToolbar } from "@/components/reports/PrintToolbar";

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

export default async function StockReportPrintPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "stock.view") && !can(user.role, "reports.view"))
    redirect("/");

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

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 1.2cm;
          }
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .page-container {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      {/* Screen Toolbar (Client Component) */}
      <PrintToolbar
        title="Pratinjau Cetak: Laporan Persediaan Stok Barang"
        subtitle="Gunakan layout A4 Landscape untuk hasil cetak terbaik."
      />

      {/* Printable Sheet */}
      <div className="page-container mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* Kop Dokumen Resmi */}
        <header className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                ANEKA JAYA / SLM
              </h1>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-widest">
                Sistem Manajemen Distribusi &amp; Pergudangan
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-bold text-slate-900">LAPORAN RESMI</p>
              <p>Dicetak: {new Date().toLocaleString("id-ID")}</p>
              <p>Oleh: {user.name || "Administrator"}</p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <h2 className="text-lg font-black text-slate-900 uppercase underline underline-offset-4">
              LAPORAN PERSEDIAAN STOK BARANG
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Lokasi: {warehouse || "Semua Gudang"}
              {status !== "all" && ` • Status: ${status}`}
              {keyword && ` • Pencarian: "${keyword}"`}
            </p>
          </div>
        </header>

        {/* Ringkasan Eksekutif (Executive Summary) */}
        <div className="my-5 grid grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
          <div>
            <span className="block text-slate-500">Total Valuasi Aset Stok</span>
            <b className="text-sm font-bold text-slate-900">
              {report.summary.totalCostValuation > 0 ? rupiah(report.summary.totalCostValuation) : "-"}
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Total Kuantitas Fisik</span>
            <b className="text-sm font-bold text-slate-900">
              {report.summary.totalQuantity.toLocaleString("id-ID")} Unit
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Total Varian Barang</span>
            <b className="text-sm font-bold text-slate-900">
              {report.summary.totalItems} Item
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Peringatan Stok</span>
            <b className="text-sm font-bold text-amber-700">
              {report.summary.warningCount} Menipis • {report.summary.outOfStockCount} Habis
            </b>
          </div>
        </div>

        {/* Tabel Data Persediaan Stok */}
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-y-2 border-slate-800 bg-slate-100 font-bold text-slate-900">
              <th className="py-2.5 px-2 text-center w-8">No</th>
              <th className="py-2.5 px-2 w-24">Kode SKU</th>
              <th className="py-2.5 px-2">Nama Barang</th>
              <th className="py-2.5 px-2 w-32">Gudang / Rak</th>
              <th className="py-2.5 px-2 text-right w-20">Qty Fisik</th>
              <th className="py-2.5 px-2 text-right w-16">Min</th>
              <th className="py-2.5 px-2 text-center w-16">Status</th>
              <th className="py-2.5 px-2 text-right w-24">Harga Modal</th>
              <th className="py-2.5 px-2 text-right w-28">Valuasi Aset</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {report.items.map((item, idx) => (
              <tr key={`${item.sku}-${item.warehouse}-${idx}`}>
                <td className="py-2 px-2 text-center text-slate-600 font-mono">
                  {idx + 1}
                </td>
                <td className="py-2 px-2 font-mono font-semibold text-slate-800">
                  {item.sku}
                </td>
                <td className="py-2 px-2 font-medium text-slate-900">
                  {item.productName}
                </td>
                <td className="py-2 px-2 text-slate-600">
                  {item.warehouse} ({item.rack})
                </td>
                <td className="py-2 px-2 text-right font-bold text-slate-900">
                  {item.quantity.toLocaleString("id-ID")} {item.unit}
                </td>
                <td className="py-2 px-2 text-right text-slate-600 font-mono">
                  {item.minStock}
                </td>
                <td className="py-2 px-2 text-center font-bold">
                  {item.status === "out_of_stock" && (
                    <span className="text-rose-700">Habis</span>
                  )}
                  {item.status === "warning" && (
                    <span className="text-amber-700">Menipis</span>
                  )}
                  {item.status === "safe" && (
                    <span className="text-emerald-700">Aman</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right text-slate-700">
                  {item.costPrice > 0 ? rupiah(item.costPrice) : "-"}
                </td>
                <td className="py-2 px-2 text-right font-bold text-slate-900">
                  {item.totalCostValuation > 0 ? rupiah(item.totalCostValuation) : "-"}
                </td>
              </tr>
            ))}
            {report.items.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Tidak ada data persediaan stok yang cocok dengan filter yang
                  dipilih.
                </td>
              </tr>
            )}
          </tbody>
          {report.items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-slate-900">
                <td colSpan={4} className="py-2.5 px-2 text-center uppercase">
                  Total Persediaan
                </td>
                <td className="py-2.5 px-2 text-right text-slate-950 font-black">
                  {report.summary.totalQuantity.toLocaleString("id-ID")}
                </td>
                <td colSpan={3} className="py-2.5 px-2 text-right text-slate-500">
                  {report.summary.totalItems} Baris Item
                </td>
                <td className="py-2.5 px-2 text-right text-slate-950 font-black">
                  {report.summary.totalCostValuation > 0
                    ? rupiah(report.summary.totalCostValuation)
                    : "-"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Kolom Tanda Tangan Resmi */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Petugas Gudang / Pemeriksa,</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              {user.name || "Petugas Gudang"}
            </p>
          </div>
          <div>
            <p className="text-slate-600">Mengetahui / Menyetujui,</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              Kepala Gudang / Manager
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
