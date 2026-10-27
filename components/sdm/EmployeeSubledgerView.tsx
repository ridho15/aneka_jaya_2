"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LoanRepaymentModal } from "@/components/sdm/LoanRepaymentModal";
import { formatCurrency } from "@/lib/currency";
import type { EmployeeLoanRow, LoanLedgerEntry } from "@/lib/sdm/loanStore";
import type { RekeningAccount } from "@/lib/business/masterData";

type Props = {
  employee: { id: string; name: string; position: string; department: string; nik?: string | null };
  activeLoans: EmployeeLoanRow[];
  openBalance: number;
  totalDisbursed: number;
  totalPaid: number;
  entries: LoanLedgerEntry[];
  rekenings: RekeningAccount[];
  canManage: boolean;
};

export function EmployeeSubledgerView({
  employee,
  activeLoans,
  openBalance,
  totalDisbursed,
  totalPaid,
  entries,
  rekenings,
  canManage
}: Props) {
  const router = useRouter();
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);

  const activeLoanOptions = activeLoans.map((l) => ({
    id: l.id,
    amount: Number(l.amount),
    remainingAmount: Number(l.remainingAmount),
    purpose: l.purpose,
    expenseRecord: {
      expenseDate: l.expenseRecord?.expenseDate ? new Date(l.expenseRecord.expenseDate).toISOString().slice(0, 10) : new Date(l.disbursedDate).toISOString().slice(0, 10),
      expenseNumber: l.expenseRecordId
    }
  }));

  const handleRepaymentSuccess = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Back button and Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/sdm/kasbon"
            className="inline-flex items-center text-xs font-semibold text-emerald-600 hover:text-emerald-700 mb-2"
          >
            ← Kembali ke Daftar Kasbon
          </Link>
          <h2 className="aj-page-title text-2xl font-bold text-slate-900">
            Buku Pembantu Kasbon: {employee.name}
          </h2>
          <p className="text-xs text-slate-500">
            {employee.position} — {employee.department} {employee.nik ? `• NIK: ${employee.nik}` : ""}
          </p>
        </div>

        {canManage && openBalance > 0 && (
          <Button onClick={() => setIsRepaymentModalOpen(true)} className="shadow-xs">
            + Catat Pelunasan Kasbon
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Kasbon Dicairkan</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(totalDisbursed)}</p>
          <p className="mt-3 text-xs text-slate-500">Akumulasi pencairan kasbon disetujui</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Dilunasi</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{formatCurrency(totalPaid)}</p>
          <p className="mt-3 text-xs text-slate-500">Total setoran masuk dan potong gaji</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo Piutang Berjalan</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">{formatCurrency(openBalance)}</p>
          <p className="mt-3 text-xs text-slate-500">Kewajiban kasbon yang masih harus dilunasi</p>
        </section>
      </div>

      {/* Ledger Table */}
      <section className="aj-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-white">
          <div>
            <h3 className="text-base font-bold text-slate-800">Mutasi & Riwayat Kartu Piutang</h3>
            <p className="mt-0.5 text-xs text-slate-500">Rekapitulasi kronologis pencairan dana dan pelunasan karyawan.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {entries.length} Transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Transaksi & Referensi</th>
                <th className="px-5 py-3">Metode / Keterangan</th>
                <th className="px-5 py-3 text-right">Debit (Pinjam)</th>
                <th className="px-5 py-3 text-right">Kredit (Bayar)</th>
                <th className="px-5 py-3 text-right">Saldo Piutang</th>
                <th className="px-5 py-3 text-center">Bukti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Belum ada riwayat transaksi kasbon untuk karyawan ini.
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => {
                  const dateStr = entry.date;
                  const isDisbursement = entry.type === "DISBURSEMENT";

                  return (
                    <tr key={`${entry.id}-${index}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs font-medium text-slate-700">
                        {dateStr}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              isDisbursement
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {isDisbursement ? "Pencairan Kasbon" : "Pelunasan Kasbon"}
                          </span>
                        </div>
                        <div className="mt-1 font-medium text-slate-800 text-xs">
                          {entry.description}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {entry.paymentMethod ? (
                          <span className="font-semibold text-slate-800">
                            {entry.paymentMethod === "POTONG_GAJI"
                              ? "Potong Gaji"
                              : entry.paymentMethod === "TRANSFER"
                              ? "Transfer Bank"
                              : entry.paymentMethod === "CASH"
                              ? "Tunai"
                              : entry.paymentMethod}
                          </span>
                        ) : (
                          "—"
                        )}
                        {entry.notes && <div className="text-slate-500 italic mt-0.5">{entry.notes}</div>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs font-mono tabular-nums font-medium text-slate-900">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs font-mono tabular-nums font-medium text-emerald-700">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs font-mono tabular-nums font-bold text-slate-900">
                        {formatCurrency(entry.runningBalance)}
                      </td>
                      <td className="px-5 py-3.5 text-center text-xs">
                        {entry.attachmentUrl ? (
                          <a
                            href={entry.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-emerald-700 transition"
                          >
                            <span>Lihat Bukti</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Repayment Modal */}
      {isRepaymentModalOpen && (
        <LoanRepaymentModal
          employeeId={employee.id}
          employeeName={employee.name}
          activeLoans={activeLoanOptions}
          rekenings={rekenings}
          isOpen={isRepaymentModalOpen}
          onClose={() => setIsRepaymentModalOpen(false)}
          onSuccess={handleRepaymentSuccess}
        />
      )}
    </div>
  );
}
