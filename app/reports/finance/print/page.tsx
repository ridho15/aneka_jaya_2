import { redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { jakartaMonthFromKey } from "@/lib/date/jakarta";
import { getFinanceReport } from "@/lib/reports/store";
import { PrintToolbar } from "@/components/reports/PrintToolbar";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  month?: string;
}>;

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default async function FinanceReportPrintPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.finance_view")) redirect("/");

  const params = await searchParams;
  const selectedMonth = jakartaMonthFromKey(params?.month);
  const summary = await getFinanceReport(selectedMonth);

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
        title="Pratinjau Cetak: Laporan Finance Bulanan"
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
                Sistem Manajemen Keuangan &amp; Kas
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
              LAPORAN FINANCE BULANAN
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Periode Bulan: {selectedMonth}
            </p>
          </div>
        </header>

        {/* Ringkasan Eksekutif Keuangan */}
        <div className="my-5 grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
          <div>
            <span className="block text-slate-500">Open Tempo Aktif</span>
            <b className="text-base font-bold text-slate-900">
              {rupiah(summary.openTempoTotal)}
            </b>
            <span className="block mt-0.5 text-[11px] text-slate-500">
              {summary.openTempo.length} piutang berjalan
            </span>
          </div>
          <div>
            <span className="block text-slate-500">Pembayaran Tempo Bulan Ini</span>
            <b className="text-base font-bold text-emerald-800">
              {rupiah(summary.tempoPaymentTotal)}
            </b>
            <span className="block mt-0.5 text-[11px] text-slate-500">
              {summary.tempoPayments.length} transaksi pelunasan
            </span>
          </div>
          <div>
            <span className="block text-slate-500">Pengeluaran Operasional Approved</span>
            <b className="text-base font-bold text-rose-800">
              {rupiah(summary.approvedExpenseTotal)}
            </b>
            <span className="block mt-0.5 text-[11px] text-slate-500">
              {summary.approvedExpenses.length} pengeluaran disetujui
            </span>
          </div>
        </div>

        {/* Tabel 1: Pengeluaran Approved */}
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            1. Rincian Pengeluaran Approved ({summary.approvedExpenses.length} Pengeluaran)
          </h3>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y-2 border-slate-800 bg-slate-100 font-bold text-slate-900">
                <th className="py-2 px-2 text-center w-8">No</th>
                <th className="py-2 px-2 w-24">Tanggal</th>
                <th className="py-2 px-2">Vendor / Penerima</th>
                <th className="py-2 px-2 w-28">Kategori</th>
                <th className="py-2 px-2">COA Akun</th>
                <th className="py-2 px-2">Deskripsi</th>
                <th className="py-2 px-2 text-right w-28">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summary.approvedExpenses.map((exp, idx) => (
                <tr key={exp.id}>
                  <td className="py-2 px-2 text-center text-slate-600 font-mono">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-2 font-mono text-slate-700">
                    {exp.expenseDate}
                  </td>
                  <td className="py-2 px-2 font-medium text-slate-900">
                    {exp.vendorName}
                  </td>
                  <td className="py-2 px-2 text-slate-700">
                    {exp.category}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {exp.coaNameSnapshot || "-"}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {exp.description}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-slate-900">
                    {rupiah(Number(exp.amount))}
                  </td>
                </tr>
              ))}
              {summary.approvedExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    Tidak ada pengeluaran approved pada bulan ini.
                  </td>
                </tr>
              )}
            </tbody>
            {summary.approvedExpenses.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={6} className="py-2 px-2 text-center uppercase">
                    Total Pengeluaran Approved
                  </td>
                  <td className="py-2 px-2 text-right text-slate-950 font-black">
                    {rupiah(summary.approvedExpenseTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Tabel 2: Open Tempo */}
        {summary.openTempo.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-800">
              2. Rincian Piutang Tempo Aktif / Open Tempo ({summary.openTempo.length} Piutang)
            </h3>
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-y-2 border-slate-800 bg-slate-100 font-bold text-slate-900">
                  <th className="py-2 px-2 text-center w-8">No</th>
                  <th className="py-2 px-2 w-24">Tgl Invoice</th>
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2 w-24">Jatuh Tempo</th>
                  <th className="py-2 px-2 w-20 text-center">Status</th>
                  <th className="py-2 px-2 text-right w-28">Total Tagihan</th>
                  <th className="py-2 px-2 text-right w-28">Sisa Piutang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.openTempo.map((t, idx) => (
                  <tr key={t.id}>
                    <td className="py-2 px-2 text-center text-slate-600 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-700">
                      {t.transactionDate}
                    </td>
                    <td className="py-2 px-2 font-medium text-slate-900">
                      {t.customerName}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-700">
                      {t.dueDate}
                    </td>
                    <td className="py-2 px-2 text-center font-semibold text-slate-800">
                      {t.status}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700">
                      {rupiah(t.originalAmount)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-slate-900">
                      {rupiah(t.remainingAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={6} className="py-2 px-2 text-center uppercase">
                    Total Sisa Piutang Berjalan
                  </td>
                  <td className="py-2 px-2 text-right text-slate-950 font-black">
                    {rupiah(summary.openTempoTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Kolom Tanda Tangan Resmi */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat Oleh (Finance / Pembukuan),</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              {user.name || "Staff Finance"}
            </p>
          </div>
          <div>
            <p className="text-slate-600">Mengetahui / Menyetujui,</p>
            <div className="mt-16 border-b border-slate-900 mx-auto w-44"></div>
            <p className="mt-1 font-bold text-slate-900">
              Manager Keuangan / Owner
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
