import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listSalesReturns } from "@/lib/sales/returnStore";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { PostReturnButton } from "@/components/sales/PostReturnButton";

function rupiah(val: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);
}

function statusBadge(status: string) {
  if (status === "POSTED") {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">POSTED (Jurnal Resmi)</span>;
  }
  if (status === "DRAFT") {
    return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">DRAFT</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{status}</span>;
}

export default async function SalesReturnListPage() {
  const user = await getCurrentUser();
  if (
    !can(user.role, "penjualan.manage") &&
    !can(user.role, "penjualan.create") &&
    !can(user.role, "accounting.view") &&
    !can(user.role, "tempo.view")
  ) {
    redirect("/");
  }

  const returns = await listSalesReturns().catch(() => []);
  const canPost = can(user.role, "penjualan.manage") || can(user.role, "accounting.journal.manage");

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
            Modul Akuntansi Penjualan
          </p>
          <h2 className="aj-page-title text-3xl font-bold">Retur Penjualan & Pengurangan Piutang</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pencatatan barang retur, pengurangan saldo piutang tempo / pengembalian kas, dan penyesuaian persediaan HPP.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
          >
            ← Kembali ke Penjualan
          </Link>
          <Link
            href="/akuntansi/jurnal"
            className="rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100 shadow-xs transition-colors"
          >
            Buku Jurnal Umum
          </Link>
        </div>
      </div>

      <div className="aj-surface overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Daftar Retur Penjualan ({returns.length})</h3>
        </div>

        {returns.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Belum ada data retur penjualan. Untuk membuat retur, buka nota pada{" "}
            <Link href="/penjualan" className="text-emerald-600 underline font-semibold">
              Riwayat Penjualan
            </Link>{" "}
            dan klik &quot;Ajukan Retur Barang&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">No. Retur</th>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Nota Asal</th>
                  <th className="px-5 py-3">Pelanggan</th>
                  <th className="px-5 py-3">Metode Kompensasi</th>
                  <th className="px-5 py-3 text-right">Nilai Retur</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Jurnal</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-slate-900">
                      {ret.returnNumber}
                    </td>
                    <td className="px-5 py-4 text-slate-600 text-xs">
                      {formatJakartaDateTime(ret.returnDate)}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/penjualan/${ret.salesRecordId}`}
                        className="font-mono text-emerald-700 hover:underline text-xs font-semibold"
                      >
                        {ret.salesRecord?.transactionNumber || ret.salesRecordId}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-900">{ret.customerName}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                      {ret.refundMethod === "REDUCE_RECEIVABLE" ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Potong Piutang</span>
                      ) : (
                        <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded">Refund Kas/Bank</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                      {rupiah(Number(ret.subtotalAmount))}
                    </td>
                    <td className="px-5 py-4">{statusBadge(ret.status)}</td>
                    <td className="px-5 py-4">
                      {ret.journalEntry ? (
                        <Link
                          href={`/akuntansi/jurnal?keyword=${ret.journalEntry.journalNumber}`}
                          className="font-mono text-xs font-bold text-emerald-700 hover:underline"
                        >
                          {ret.journalEntry.journalNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {ret.status === "DRAFT" && canPost ? (
                        <PostReturnButton returnId={ret.id} returnNumber={ret.returnNumber} />
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Tersimpan</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
