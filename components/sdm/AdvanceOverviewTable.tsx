"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AdvanceSettlementModal } from "@/components/sdm/AdvanceSettlementModal";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";
import type { EmployeeLoanRow } from "@/lib/sdm/loanStore";
import type { RekeningAccount } from "@/lib/business/masterData";

type Props = {
  loans: EmployeeLoanRow[];
  rekenings: RekeningAccount[];
  canManage: boolean;
};

export function AdvanceOverviewTable({ loans, rekenings, canManage }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "SETTLED" | "all">("ACTIVE");
  const [selectedLoanForSettlement, setSelectedLoanForSettlement] = useState<EmployeeLoanRow | null>(null);

  const filtered = useMemo(() => {
    return loans.filter((loan) => {
      if (statusFilter !== "all" && loan.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          loan.employee.name.toLowerCase().includes(q) ||
          (loan.purpose && loan.purpose.toLowerCase().includes(q)) ||
          loan.employee.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [loans, statusFilter, search]);

  const summary = useMemo(() => {
    let totalActiveAmount = 0;
    let activeCount = 0;
    let settledCount = 0;
    let totalAllDisbursed = 0;

    loans.forEach((loan) => {
      const amt = Number(loan.amount);
      totalAllDisbursed += amt;
      if (loan.status === "ACTIVE") {
        totalActiveAmount += amt;
        activeCount++;
      } else if (loan.status === "SETTLED") {
        settledCount++;
      }
    });

    return { totalActiveAmount, activeCount, settledCount, totalAllDisbursed };
  }, [loans]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uang Muka Belum Selesai (Aktif)</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">{formatCurrency(summary.totalActiveAmount)}</p>
          <p className="mt-3 text-xs text-slate-500">{summary.activeCount} transaksi menunggu laporan nota</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uang Muka Selesai (Dipertanggungjawabkan)</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{summary.settledCount} Transaksi</p>
          <p className="mt-3 text-xs text-slate-500">Nota riil telah selesai dipertanggungjawabkan</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Uang Muka Dicairkan</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(summary.totalAllDisbursed)}</p>
          <p className="mt-3 text-xs text-slate-500">Total keseluruhan uang muka operasional</p>
        </section>
      </div>

      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
          <div className="flex flex-1 flex-wrap gap-3">
            <Input
              placeholder="Cari karyawan, tujuan dinas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "SETTLED" | "all")}
              className="w-48"
            >
              <option value="ACTIVE">Status: Belum Selesai (Aktif)</option>
              <option value="SETTLED">Status: Sudah Selesai</option>
              <option value="all">Semua Status</option>
            </Select>
          </div>

          <Link
            href="/pengeluaran/input"
            className="inline-flex items-center justify-center rounded border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-2xs"
          >
            + Input Uang Muka Baru
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Karyawan Penerima</th>
                <th className="px-5 py-3">Tujuan / Keperluan</th>
                <th className="px-5 py-3 text-right">Nominal Uang Muka</th>
                <th className="px-5 py-3">Tenggat Waktu</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Tidak ada data uang muka yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filtered.map((loan) => {
                  const dateStr = jakartaDateKey(loan.expenseRecord.expenseDate);
                  const dueDateStr = loan.dueDate ? jakartaDateKey(loan.dueDate) : null;
                  const isSettled = loan.status === "SETTLED";
                  const approvalStatus = loan.expenseRecord?.approvalStatus;

                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs font-mono tabular-nums text-slate-700">
                        {dateStr}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{loan.employee.name}</div>
                        <div className="text-xs text-slate-500">
                          {loan.employee.position} — {loan.employee.department}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="font-medium text-slate-800">{loan.purpose || "Uang muka operasional"}</div>
                        {isSettled && loan.settlement && (
                          <div className="mt-1 text-slate-500">
                            Realisasi: <b className="font-mono tabular-nums">{formatCurrency(Number(loan.settlement.actualExpenseAmount))}</b>
                            {Number(loan.settlement.refundAmount) > 0 && (
                              <span> • Refund: <b className="font-mono tabular-nums">{formatCurrency(Number(loan.settlement.refundAmount))}</b></span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatCurrency(Number(loan.amount))}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-mono tabular-nums text-slate-600">
                        {dueDateStr || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            isSettled
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : approvalStatus === "pending_approval"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : approvalStatus === "rejected"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {isSettled
                            ? "Selesai"
                            : approvalStatus === "pending_approval"
                            ? "Menunggu Approval"
                            : approvalStatus === "rejected"
                            ? "Ditolak"
                            : "Belum Selesai"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {!isSettled && canManage ? (
                          approvalStatus === "pending_approval" ? (
                            <span className="text-xs text-amber-600 font-medium">Perlu Approval</span>
                          ) : approvalStatus === "rejected" ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedLoanForSettlement(loan)}
                              className="inline-flex items-center rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-emerald-700 transition"
                            >
                              Pertanggungjawaban
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
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

      {/* Advance Settlement Modal */}
      {selectedLoanForSettlement && (
        <AdvanceSettlementModal
          key={selectedLoanForSettlement.id}
          loan={selectedLoanForSettlement}
          rekenings={rekenings}
          isOpen={Boolean(selectedLoanForSettlement)}
          onClose={() => setSelectedLoanForSettlement(null)}
          onSuccess={() => {
            setSelectedLoanForSettlement(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
