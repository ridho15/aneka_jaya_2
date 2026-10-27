"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import { formatJakartaDate, jakartaDateKey } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";
import type { TrialBalanceResult } from "@/lib/accounting/ledgerStore";

type Props = {
  initialReport: TrialBalanceResult;
};

export function TrialBalanceTable({ initialReport }: Props) {
  const { showToast } = useToast();
  const [report, setReport] = useState<TrialBalanceResult>(initialReport);
  const [startDate, setStartDate] = useState(initialReport.period.startDate);
  const [endDate, setEndDate] = useState(initialReport.period.endDate);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [hideZero, setHideZero] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTrialBalance = async (sDate = startDate, eDate = endDate) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: sDate,
        asOfDate: eDate,
      });
      const res = await fetch(`/api/accounting/trial-balance?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal memuat neraca saldo.", "error");
        return;
      }
      setReport(data.data);
    } catch {
      showToast("Terjadi kesalahan jaringan saat memuat neraca saldo.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTrialBalance();
  };

  const handlePresetMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const sDate = `${year}-${month}-01`;
    const eDate = jakartaDateKey(today);
    setStartDate(sDate);
    setEndDate(eDate);
    fetchTrialBalance(sDate, eDate);
  };

  const filteredAccounts = useMemo(() => {
    return report.accounts.filter((acc) => {
      if (categoryFilter !== "ALL" && acc.category !== categoryFilter) return false;
      if (hideZero) {
        const hasMutation = acc.periodDebit > 0 || acc.periodCredit > 0;
        const hasEnding = acc.endingDebit > 0 || acc.endingCredit > 0;
        if (!hasMutation && !hasEnding) return false;
      }
      return true;
    });
  }, [report.accounts, categoryFilter, hideZero]);

  const diffEnding = Math.abs(report.totals.endingDebit - report.totals.endingCredit);

  return (
    <div className="space-y-6">
      {/* Equilibrium Status Banner */}
      <section
        className={`aj-surface p-5 border-l-4 ${
          report.isEquilibrium
            ? "border-l-emerald-600 bg-emerald-50/40"
            : "border-l-red-600 bg-red-50/40"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${report.isEquilibrium ? "text-emerald-800" : "text-red-800"}`}>
                {report.isEquilibrium
                  ? "NERACA SALDO SEIMBANG (EQUILIBRIUM)"
                  : "PERINGATAN: NERACA SALDO TIDAK SEIMBANG"}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                  report.isEquilibrium
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-red-100 text-red-800 border border-red-300"
                }`}
              >
                {report.isEquilibrium ? "VALID" : "OUT OF BALANCE"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {report.isEquilibrium
                ? `Total saldo debit (${formatCurrency(report.totals.endingDebit)}) tepat seimbang dengan total saldo kredit (${formatCurrency(report.totals.endingCredit)}).`
                : `Ditemukan selisih sebesar ${formatCurrency(diffEnding)} antara total saldo debit dan kredit.`}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-500 uppercase">Periode Neraca</span>
            <p className="font-mono text-sm font-bold text-slate-900">
              {formatJakartaDate(report.period.startDate)} s/d {formatJakartaDate(report.period.endDate)}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="aj-surface p-5">
        <form onSubmit={handleApply} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-wrap gap-4">
            <div className="w-36">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="w-36">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="w-48">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Kategori Akun
              </label>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">Semua Kategori</option>
                <option value="ASSET">ASET (1-xxxx)</option>
                <option value="LIABILITY">KEWAJIBAN (2-xxxx)</option>
                <option value="EQUITY">EKUITAS (3-xxxx)</option>
                <option value="REVENUE">PENDAPATAN (4-xxxx)</option>
                <option value="EXPENSE">BEBAN (6-xxxx)</option>
              </Select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={hideZero}
                  onChange={(e) => setHideZero(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Sembunyikan Akun Saldo Nol
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={handlePresetMonth}>
              Bulan Ini
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Memuat..." : "Terapkan Filter"}
            </Button>
          </div>
        </form>
      </section>

      {/* Trial Balance Table */}
      <section className="aj-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th rowSpan={2} className="py-2.5 px-4 w-28 border-r border-slate-200">Kode Akun</th>
                <th rowSpan={2} className="py-2.5 px-4 border-r border-slate-200">Nama Akun & Kategori</th>
                <th rowSpan={2} className="py-2.5 px-3 w-20 text-center border-r border-slate-200">Posisi</th>
                <th colSpan={2} className="py-2 px-4 text-center border-b border-r border-slate-200 bg-slate-200/60">
                  Pergerakan Periode
                </th>
                <th colSpan={2} className="py-2 px-4 text-center border-b border-slate-200 bg-emerald-100/60 text-emerald-950">
                  Saldo Akhir (Neraca Saldo)
                </th>
                <th rowSpan={2} className="py-2.5 px-3 w-20 text-center">Buku Besar</th>
              </tr>
              <tr>
                <th className="py-1.5 px-3 w-36 text-right border-r border-slate-200 bg-slate-100">Debit (Rp)</th>
                <th className="py-1.5 px-3 w-36 text-right border-r border-slate-200 bg-slate-100">Kredit (Rp)</th>
                <th className="py-1.5 px-3 w-36 text-right border-r border-slate-200 bg-emerald-50 text-emerald-900">Debit (Rp)</th>
                <th className="py-1.5 px-3 w-36 text-right bg-emerald-50 text-emerald-900">Kredit (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Tidak ada akun yang sesuai dengan filter neraca saldo.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.accountId} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 border-r border-slate-100">
                      {acc.code}
                    </td>
                    <td className="py-2.5 px-4 border-r border-slate-100">
                      <span className="font-semibold text-slate-900">{acc.name}</span>
                      <span className="ml-2 text-[10px] font-mono uppercase text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                        {acc.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-[11px] text-slate-600 border-r border-slate-100">
                      {acc.normalBalance === "DEBIT" ? "D" : "K"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 border-r border-slate-100">
                      {acc.periodDebit > 0 ? formatCurrency(acc.periodDebit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 border-r border-slate-100">
                      {acc.periodCredit > 0 ? formatCurrency(acc.periodCredit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 border-r border-slate-100 bg-slate-50/30">
                      {acc.endingDebit > 0 ? formatCurrency(acc.endingDebit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 bg-slate-50/30">
                      {acc.endingCredit > 0 ? formatCurrency(acc.endingCredit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Link
                        href={`/akuntansi/buku-besar?accountId=${acc.accountId}`}
                        className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline"
                        title="Buka Buku Besar Akun Ini"
                      >
                        ↗
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
              <tr>
                <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider text-slate-700 border-r border-slate-200">
                  Total
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 border-r border-slate-200">
                  {formatCurrency(report.totals.periodDebit)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 border-r border-slate-200">
                  {formatCurrency(report.totals.periodCredit)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-900 bg-emerald-100/60 border-r border-slate-200">
                  {formatCurrency(report.totals.endingDebit)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-900 bg-emerald-100/60">
                  {formatCurrency(report.totals.endingCredit)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
