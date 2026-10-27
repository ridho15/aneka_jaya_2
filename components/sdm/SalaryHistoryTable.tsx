"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { formatCurrency } from "@/lib/currency";
import type { SalaryPaymentRow, SalarySummary } from "@/lib/sdm/salaryStore";

type Props = {
  initialItems: SalaryPaymentRow[];
  initialSummary: SalarySummary;
  initialPeriod?: string;
};

export function SalaryHistoryTable({ initialItems, initialSummary, initialPeriod }: Props) {
  const [period, setPeriod] = useState<string>(initialPeriod || "");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    return initialItems.filter((item) => {
      if (period && item.periodMonth !== period) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.employeeName.toLowerCase().includes(q) ||
          item.position.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialItems, period, search]);

  const summary = useMemo(() => {
    if (!period) {
      const avg = initialSummary.totalDisbursements > 0 ? Math.round(initialSummary.totalPaid / initialSummary.totalDisbursements) : 0;
      return {
        period: initialSummary.periodMonth,
        totalAmount: initialSummary.totalPaid,
        totalEmployees: initialSummary.totalEmployeesPaid,
        averageAmount: avg
      };
    }
    const itemsInPeriod = initialItems.filter((i) => i.periodMonth === period);
    const totalAmount = itemsInPeriod.reduce((acc, curr) => acc + curr.amountPaid, 0);
    const count = itemsInPeriod.length;
    const average = count > 0 ? Math.round(totalAmount / count) : 0;
    return {
      period,
      totalAmount,
      totalEmployees: new Set(itemsInPeriod.map((i) => i.employeeId)).size,
      averageAmount: average
    };
  }, [initialItems, initialSummary, period]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Gaji Ditransfer {period ? `(${period})` : "(Semua Periode)"}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{formatCurrency(summary.totalAmount)}</p>
          <p className="mt-3 text-xs text-slate-500">Total nominal bersih yang dibayarkan ke rekening karyawan</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Karyawan Menerima Gaji</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{summary.totalEmployees} Karyawan</p>
          <p className="mt-3 text-xs text-slate-500">Pembayaran gaji terverifikasi</p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rata-rata Gaji Bersih</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(summary.averageAmount)}</p>
          <p className="mt-3 text-xs text-slate-500">Rata-rata per transaksi transfer gaji</p>
        </section>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed flex items-start gap-3">
        <svg className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <span className="font-semibold text-slate-900">Standar Pencatatan Gaji UKM:</span>{" "}
          SLM mencatat <b>jumlah bersih yang dibayarkan</b> (net take-home pay) langsung dari rekening perusahaan.
          Tidak ada asumsi potongan pajak/BPJS fiktif jika belum tercantum pada mutasi perbankan riil.
        </div>
      </div>

      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
          <div className="flex flex-1 flex-wrap gap-3">
            <Input
              placeholder="Cari karyawan, jabatan, departemen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filter Periode:</span>
              <Input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-40"
              />
              {period && (
                <button
                  type="button"
                  onClick={() => setPeriod("")}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <Link
            href="/pengeluaran/input"
            className="inline-flex items-center justify-center rounded border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-2xs"
          >
            + Input Pembayaran Gaji
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal Bayar</th>
                <th className="px-5 py-3">Karyawan</th>
                <th className="px-5 py-3">Jabatan & Departemen</th>
                <th className="px-5 py-3 text-center">Periode Gaji</th>
                <th className="px-5 py-3">Rekening Pembayaran</th>
                <th className="px-5 py-3 text-right">Jumlah Dibayarkan</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Bukti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Tidak ada transaksi pembayaran gaji yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs font-medium text-slate-700">
                        {item.paymentDate}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{item.employeeName}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800 text-xs">{item.position}</div>
                        <div className="text-xs text-slate-500">{item.department}</div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-700 font-mono">
                          {item.periodMonth}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {item.rekeningNameSnapshot || "Rekening"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-700 text-sm">
                        {formatCurrency(item.amountPaid)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            item.expenseApprovalStatus === "approved"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : item.expenseApprovalStatus === "rejected"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.expenseApprovalStatus === "approved"
                            ? "Disetujui"
                            : item.expenseApprovalStatus === "rejected"
                            ? "Ditolak"
                            : "Menunggu Approval"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-xs">
                        {item.attachmentUrl ? (
                          <a
                            href={item.attachmentUrl}
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
    </div>
  );
}
