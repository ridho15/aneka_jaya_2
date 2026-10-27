"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import type { IncomeStatementResult } from "@/lib/reports/financialStatements";

type TipeOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  initialReport: IncomeStatementResult;
  tipeOptions: TipeOption[];
};

export function IncomeStatementViewer({ initialReport, tipeOptions }: Props) {
  const [report, setReport] = useState<IncomeStatementResult>(initialReport);
  const [startDate, setStartDate] = useState(initialReport.period.startDate);
  const [endDate, setEndDate] = useState(initialReport.period.endDate);
  const [selectedTipeId, setSelectedTipeId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedTipeId ? { tipeId: selectedTipeId } : {})
      });
      const res = await fetch(`/api/reports/income-statement?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      }
    } catch (e) {
      console.error("Gagal memuat laporan laba rugi:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isNetProfit = report.netOperatingIncome >= 0;

  return (
    <div className="space-y-6">
      {/* Filter & Action Bar - Hidden on print */}
      <div className="aj-surface p-4 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Dari Tanggal
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Sampai Tanggal
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Tipe Pembukuan
            </label>
            <Select
              value={selectedTipeId}
              onChange={(e) => setSelectedTipeId(e.target.value)}
              className="text-xs w-full"
            >
              <option value="">Semua Pembukuan</option>
              {tipeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} - {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button onClick={fetchReport} disabled={isLoading} className="text-xs">
            {isLoading ? "Memuat..." : "Terapkan Filter"}
          </Button>
          <Button variant="secondary" onClick={handlePrint} className="text-xs">
            Cetak Dokumen
          </Button>
        </div>
      </div>

      {/* Main Financial Statement Document */}
      <div className="aj-surface border border-slate-200 p-8 print:p-0 print:border-none shadow-sm max-w-4xl mx-auto">
        {/* Document Header */}
        <div className="text-center border-b border-slate-200 pb-6 mb-6">
          <h1 className="text-lg font-bold tracking-wider text-slate-900 uppercase">
            PT SURYA LOGAM MULIA
          </h1>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 uppercase mt-1">
            LAPORAN LABA RUGI KOMPREHENSIF
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            Periode: {report.period.startDate} s/d {report.period.endDate}
          </p>
        </div>

        {/* Financial Lines */}
        <div className="space-y-6 text-xs">
          {/* 1. REVENUE SECTION */}
          <div>
            <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 text-[11px]">
              <span>PENDAPATAN USAHA (REVENUE)</span>
              <span>NOMINAL (IDR)</span>
            </div>

            <div className="divide-y divide-slate-200 px-3 py-1">
              <div className="flex justify-between py-2 text-slate-900">
                <span>Pendapatan Penjualan Barang</span>
                <span className="tabular-nums font-mono">{formatCurrency(report.revenue.grossSales)}</span>
              </div>

              {report.revenue.forexGains > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Keuntungan Selisih Kurs Valas (4-1002)</span>
                  <span className="tabular-nums font-mono">{formatCurrency(report.revenue.forexGains)}</span>
                </div>
              )}

              {report.revenue.salesDeductions > 0 && (
                <div className="flex justify-between py-2 text-rose-600">
                  <span>Dikurangi: Retur & Potongan Penjualan (4-1003)</span>
                  <span className="tabular-nums font-mono">
                    ({formatCurrency(report.revenue.salesDeductions)})
                  </span>
                </div>
              )}

              <div className="flex justify-between py-2.5 font-bold text-slate-900 border-t border-slate-200">
                <span>TOTAL PENDAPATAN BERSIH</span>
                <span className="tabular-nums font-mono text-emerald-700">
                  {formatCurrency(report.revenue.netRevenue)}
                </span>
              </div>
            </div>
          </div>

          {/* 2. COGS SECTION */}
          <div>
            <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 text-[11px]">
              <span>HARGA POKOK PENJUALAN (HPP)</span>
              <span>NOMINAL (IDR)</span>
            </div>

            <div className="divide-y divide-slate-200 px-3 py-1">
              <div className="flex justify-between py-2 text-slate-900">
                <span>Beban Pokok Penjualan Riil (5-1001)</span>
                <span className="tabular-nums font-mono">{formatCurrency(report.cogs.totalCogs)}</span>
              </div>

              <div className="flex justify-between py-2.5 font-bold text-slate-900 border-t border-slate-200">
                <span>TOTAL HARGA POKOK PENJUALAN</span>
                <span className="tabular-nums font-mono text-rose-600">
                  ({formatCurrency(report.cogs.totalCogs)})
                </span>
              </div>
            </div>
          </div>

          {/* 3. GROSS PROFIT HIGHLIGHT */}
          <div className="rounded border border-slate-200 bg-slate-100 px-4 py-3 flex justify-between items-center text-sm font-bold">
            <div>
              <span className="uppercase tracking-wider text-slate-900">LABA KOTOR (GROSS PROFIT)</span>
              <span className="ml-2 text-xs font-normal text-slate-500">
                Margin: {report.grossProfitMargin}%
              </span>
            </div>
            <span
              className={`tabular-nums font-mono ${
                report.grossProfit >= 0 ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {formatCurrency(report.grossProfit)}
            </span>
          </div>

          {/* 4. OPERATING EXPENSES SECTION */}
          <div>
            <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 text-[11px]">
              <span>BEBAN OPERASIONAL (OPERATING EXPENSES)</span>
              <span>NOMINAL (IDR)</span>
            </div>

            <div className="divide-y divide-slate-200 px-3 py-1">
              <div className="flex justify-between py-2 text-slate-900">
                <span>Beban Gaji & Upah Karyawan (6-1002)</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(report.operatingExpenses.salaryExpense)}
                </span>
              </div>

              <div className="flex justify-between py-2 text-slate-900">
                <span>Beban Operasional Kantor & Umum (6-1001)</span>
                <span className="tabular-nums font-mono">
                  {formatCurrency(report.operatingExpenses.generalExpense)}
                </span>
              </div>

              {report.operatingExpenses.logisticsExpense > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Beban Transport & Logistik (6-1003)</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(report.operatingExpenses.logisticsExpense)}
                  </span>
                </div>
              )}

              {report.operatingExpenses.maintenanceExpense > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Beban Pemeliharaan & Perbaikan (6-1004)</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(report.operatingExpenses.maintenanceExpense)}
                  </span>
                </div>
              )}

              {report.operatingExpenses.utilitiesExpense > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Beban Utilitas, Air & Komunikasi (6-1005)</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(report.operatingExpenses.utilitiesExpense)}
                  </span>
                </div>
              )}

              {report.operatingExpenses.forexLossExpense > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Kerugian Selisih Kurs Valas (6-1006)</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(report.operatingExpenses.forexLossExpense)}
                  </span>
                </div>
              )}

              {report.operatingExpenses.otherExpenses > 0 && (
                <div className="flex justify-between py-2 text-slate-900">
                  <span>Beban Operasional Lainnya</span>
                  <span className="tabular-nums font-mono">
                    {formatCurrency(report.operatingExpenses.otherExpenses)}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-2.5 font-bold text-slate-900 border-t border-slate-200">
                <span>TOTAL BEBAN OPERASIONAL</span>
                <span className="tabular-nums font-mono text-rose-600">
                  ({formatCurrency(report.operatingExpenses.totalOperatingExpenses)})
                </span>
              </div>
            </div>
          </div>

          {/* 5. NET OPERATING INCOME SUMMARY CARD */}
          <div
            className={`rounded-md border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isNetProfit
                ? "border-emerald-500/40 bg-emerald-50"
                : "border-rose-500/40 bg-rose-50"
            }`}
          >
            <div>
              <p
                className={`text-xs font-bold uppercase tracking-widest ${
                  isNetProfit ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {isNetProfit ? "LABA BERSIH OPERASIONAL" : "RUGI BERSIH OPERASIONAL"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Net Profit Margin: <strong className="text-slate-900">{report.netProfitMargin}%</strong>
              </p>
            </div>

            <div className="text-right">
              <span
                className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                  isNetProfit ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatCurrency(report.netOperatingIncome)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
