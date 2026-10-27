"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import type { BalanceSheetResult } from "@/lib/reports/financialStatements";

type TipeOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  initialReport: BalanceSheetResult;
  tipeOptions: TipeOption[];
};

export function BalanceSheetViewer({ initialReport, tipeOptions }: Props) {
  const [report, setReport] = useState<BalanceSheetResult>(initialReport);
  const [asOfDate, setAsOfDate] = useState(initialReport.asOfDate);
  const [selectedTipeId, setSelectedTipeId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        asOfDate,
        ...(selectedTipeId ? { tipeId: selectedTipeId } : {})
      });
      const res = await fetch(`/api/reports/balance-sheet?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      }
    } catch (e) {
      console.error("Gagal memuat laporan neraca:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Filter & Action Bar - Hidden on print */}
      <div className="aj-surface p-4 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Per Tanggal (As of Date)
            </label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
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

      {/* Equilibrium Status Indicator Banner */}
      <div
        className={`rounded-md border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          report.isBalanced
            ? "border-emerald-500/40 bg-emerald-50 text-emerald-800"
            : "border-rose-500/40 bg-rose-50 text-rose-800"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              report.isBalanced ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            {report.isBalanced ? "✓" : "!"}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">
              {report.isBalanced
                ? "NERACA SEIMBANG (EQUILIBRIUM DOUBLE-ENTRY SEMPURNA)"
                : "PERINGATAN: NERACA TIDAK SEIMBANG"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Persamaan Akuntansi: Total Aset = Total Liabilitas + Total Ekuitas
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-semibold uppercase text-slate-500">Selisih: </span>
          <span className="font-mono font-bold text-sm tabular-nums">
            {formatCurrency(report.difference)}
          </span>
        </div>
      </div>

      {/* Main Financial Statement Document */}
      <div className="aj-surface border border-slate-200 p-8 print:p-0 print:border-none shadow-sm max-w-5xl mx-auto">
        {/* Document Header */}
        <div className="text-center border-b border-slate-200 pb-6 mb-6">
          <h1 className="text-lg font-bold tracking-wider text-slate-900 uppercase">
            PT SURYA LOGAM MULIA
          </h1>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 uppercase mt-1">
            LAPORAN POSISI KEUANGAN (NERACA)
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            Posisi Per Tanggal: {report.asOfDate}
          </p>
        </div>

        {/* 2-Column Accounting Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-xs">
          {/* KOLOM KIRI: ASET (AKTIVA) */}
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 text-[11px]">
                <span>ASET (AKTIVA)</span>
                <span>NOMINAL (IDR)</span>
              </div>

              {/* ASET LANCAR */}
              <div className="mt-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-3">
                  Aset Lancar (Current Assets)
                </p>
                <div className="divide-y divide-slate-200 px-3 py-1">
                  {report.assets.currentAssets.length === 0 ? (
                    <div className="py-2 text-slate-500 italic">Tidak ada saldo aset lancar.</div>
                  ) : (
                    report.assets.currentAssets.map((line) => (
                      <div key={line.id} className="flex justify-between py-1.5 text-slate-900">
                        <span>
                          {line.code} {line.name}
                        </span>
                        <span className="tabular-nums font-mono">{formatCurrency(line.amount)}</span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between py-2 font-bold text-slate-900 border-t border-slate-200 mt-1">
                    <span>Subtotal Aset Lancar</span>
                    <span className="tabular-nums font-mono text-emerald-700">
                      {formatCurrency(report.assets.totalCurrentAssets)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ASET TETAP */}
              <div className="mt-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-3">
                  Aset Tetap (Fixed Assets)
                </p>
                <div className="divide-y divide-slate-200 px-3 py-1">
                  {report.assets.fixedAssets.length === 0 ? (
                    <div className="py-2 text-slate-500 italic">Tidak ada saldo aset tetap.</div>
                  ) : (
                    report.assets.fixedAssets.map((line) => (
                      <div key={line.id} className="flex justify-between py-1.5 text-slate-900">
                        <span>
                          {line.code} {line.name}
                        </span>
                        <span className="tabular-nums font-mono">{formatCurrency(line.amount)}</span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between py-2 font-bold text-slate-900 border-t border-slate-200 mt-1">
                    <span>Subtotal Aset Tetap</span>
                    <span className="tabular-nums font-mono">
                      {formatCurrency(report.assets.totalFixedAssets)}
                    </span>
                  </div>
                </div>
              </div>

              {/* TOTAL ASET */}
              <div className="rounded border border-slate-200 bg-slate-100 p-3 mt-6 flex justify-between items-center text-sm font-bold">
                <span className="uppercase tracking-wider text-slate-900">TOTAL ASET</span>
                <span className="tabular-nums font-mono text-emerald-700 text-base">
                  {formatCurrency(report.assets.totalAssets)}
                </span>
              </div>
            </div>
          </div>

          {/* KOLOM KANAN: LIABILITAS & EKUITAS (PASIVA) */}
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 text-[11px]">
                <span>KEWAJIBAN & EKUITAS (PASIVA)</span>
                <span>NOMINAL (IDR)</span>
              </div>

              {/* KEWAJIBAN JANGKA PENDEK */}
              <div className="mt-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-3">
                  Kewajiban Jangka Pendek (Current Liabilities)
                </p>
                <div className="divide-y divide-slate-200 px-3 py-1">
                  {report.liabilities.currentLiabilities.length === 0 ? (
                    <div className="py-2 text-slate-500 italic">Tidak ada kewajiban tercatat.</div>
                  ) : (
                    report.liabilities.currentLiabilities.map((line) => (
                      <div key={line.id} className="flex justify-between py-1.5 text-slate-900">
                        <span>
                          {line.code} {line.name}
                        </span>
                        <span className="tabular-nums font-mono">{formatCurrency(line.amount)}</span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between py-2 font-bold text-slate-900 border-t border-slate-200 mt-1">
                    <span>Subtotal Kewajiban</span>
                    <span className="tabular-nums font-mono text-amber-700">
                      {formatCurrency(report.liabilities.totalLiabilities)}
                    </span>
                  </div>
                </div>
              </div>

              {/* EKUITAS PEMILIK */}
              <div className="mt-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-3">
                  Ekuitas Pemilik (Owner's Equity)
                </p>
                <div className="divide-y divide-slate-200 px-3 py-1">
                  <div className="flex justify-between py-1.5 text-slate-900">
                    <span>3-1001 Modal Disetor Pemilik</span>
                    <span className="tabular-nums font-mono">{formatCurrency(report.equity.paidInCapital)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 text-slate-900">
                    <span>3-1002 Laba Ditahan (Retained Earnings)</span>
                    <span className="tabular-nums font-mono">{formatCurrency(report.equity.retainedEarnings)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 text-slate-900">
                    <span>Laba Periode Berjalan (Current Net Earnings)</span>
                    <span
                      className={`tabular-nums font-mono ${
                        report.equity.currentEarnings >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatCurrency(report.equity.currentEarnings)}
                    </span>
                  </div>

                  <div className="flex justify-between py-2 font-bold text-slate-900 border-t border-slate-200 mt-1">
                    <span>Subtotal Ekuitas</span>
                    <span className="tabular-nums font-mono text-blue-700">
                      {formatCurrency(report.equity.totalEquity)}
                    </span>
                  </div>
                </div>
              </div>

              {/* TOTAL KEWAJIBAN & EKUITAS */}
              <div className="rounded border border-slate-200 bg-slate-100 p-3 mt-6 flex justify-between items-center text-sm font-bold">
                <span className="uppercase tracking-wider text-slate-900">
                  TOTAL KEWAJIBAN & EKUITAS
                </span>
                <span className="tabular-nums font-mono text-emerald-700 text-base">
                  {formatCurrency(report.totalLiabilitiesAndEquity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
