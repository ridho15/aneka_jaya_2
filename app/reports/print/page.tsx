import { redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { jakartaDateFromKey } from "@/lib/date/jakarta";
import { getPaidSalesReport } from "@/lib/reports/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import { PrintToolbar } from "@/components/reports/PrintToolbar";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  date?: string;
}>;

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default async function DailyReportPrintPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.view")) redirect("/");

  const params = await searchParams;
  const selectedDate = jakartaDateFromKey(params?.date);
  const [summary, tempo] = await Promise.all([
    getPaidSalesReport(selectedDate),
    listTempoReceivables(),
  ]);
  const openTempo = tempo.filter(
    (row) => !["paid", "cancelled", "written_off"].includes(row.status),
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
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
        title="Pratinjau Cetak: Laporan Penerimaan Harian"
        subtitle="Gunakan layout A4 Portrait untuk hasil cetak terbaik."
      />

      {/* Printable Sheet */}
      <div className="page-container mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* Kop Dokumen Resmi */}
        <header className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                ANEKA JAYA / SLM
              </h1>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-widest">
                Sistem Manajemen Kas &amp; Penjualan
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
              LAPORAN PENERIMAAN KAS HARIAN
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Tanggal Transaksi: {selectedDate}
            </p>
          </div>
        </header>

        {/* Ringkasan Penerimaan */}
        <div className="my-5 grid grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
          <div>
            <span className="block text-slate-500">Grand Total Diterima</span>
            <b className="text-sm font-bold text-slate-900">
              {rupiah(summary.grandTotal)}
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Total Tunai (Cash)</span>
            <b className="text-sm font-bold text-slate-900">
              {rupiah(summary.totalCash)}
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Total Transfer (TF)</span>
            <b className="text-sm font-bold text-slate-900">
              {rupiah(summary.totalTf)}
            </b>
          </div>
          <div>
            <span className="block text-slate-500">Pelunasan Tempo</span>
            <b className="text-sm font-bold text-slate-900">
              {rupiah(summary.tempoPaymentTotal)}
            </b>
          </div>
        </div>

        {/* Tabel 1: Penjualan Lunas */}
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            1. Rincian Penjualan Lunas ({summary.paidSales.length} Transaksi)
          </h3>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y-2 border-slate-800 bg-slate-100 font-bold text-slate-900">
                <th className="py-2 px-2 text-center w-8">No</th>
                <th className="py-2 px-2">Customer</th>
                <th className="py-2 px-2 w-16 text-center">Tipe</th>
                <th className="py-2 px-2 w-20 text-center">Metode</th>
                <th className="py-2 px-2">Rekening / Akun</th>
                <th className="py-2 px-2 text-right w-28">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summary.paidSales.map((sale, idx) => (
                <tr key={sale.id}>
                  <td className="py-2 px-2 text-center text-slate-600 font-mono">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-2 font-medium text-slate-900">
                    {sale.customerName}
                  </td>
                  <td className="py-2 px-2 text-center text-slate-700">
                    {sale.tipeCodeSnapshot || "-"}
                  </td>
                  <td className="py-2 px-2 text-center font-semibold text-slate-800">
                    {sale.paymentMethod}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {sale.initialPaymentRekeningNameSnapshot || "-"}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-slate-900">
                    {rupiah(Number(sale.total))}
                  </td>
                </tr>
              ))}
              {summary.paidSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    Tidak ada transaksi penjualan lunas pada tanggal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tabel 2: Pembayaran Tempo */}
        {summary.tempoPayments && summary.tempoPayments.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-800">
              2. Rincian Pelunasan Piutang Tempo ({summary.tempoPayments.length} Pembayaran)
            </h3>
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-y-2 border-slate-800 bg-slate-100 font-bold text-slate-900">
                  <th className="py-2 px-2 text-center w-8">No</th>
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2 w-20 text-center">Metode</th>
                  <th className="py-2 px-2">Rekening / Akun</th>
                  <th className="py-2 px-2">Catatan</th>
                  <th className="py-2 px-2 text-right w-28">Jumlah Bayar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.tempoPayments.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="py-2 px-2 text-center text-slate-600 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2 font-medium text-slate-900">
                      {p.customerName || "-"}
                    </td>
                    <td className="py-2 px-2 text-center font-semibold text-slate-800">
                      {p.paymentMethod}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {p.rekeningNameSnapshot || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-500">
                      {p.notes || "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-slate-900">
                      {rupiah(p.amountPaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={5} className="py-2 px-2 text-center uppercase">
                    Total Pelunasan Tempo
                  </td>
                  <td className="py-2 px-2 text-right text-slate-950 font-black">
                    {rupiah(summary.tempoPaymentTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Kolom Tanda Tangan Resmi */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat Oleh (Kasir / Petugas),</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              {user.name || "Petugas Kasir"}
            </p>
          </div>
          <div>
            <p className="text-slate-600">Mengetahui / Menyetujui,</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              Owner / Pimpinan Usaha
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
