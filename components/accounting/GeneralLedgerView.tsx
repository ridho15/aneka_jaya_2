"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { formatJakartaDate, jakartaDateKey } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";
import type { SimpleAccount } from "./ManualJournalModal";
import type { GeneralLedgerResult } from "@/lib/accounting/ledgerStore";

type Props = {
  accounts: SimpleAccount[];
  initialAccountId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialReport: GeneralLedgerResult;
};

export function GeneralLedgerView({
  accounts,
  initialAccountId,
  initialStartDate,
  initialEndDate,
  initialReport,
}: Props) {
  const { showToast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [report, setReport] = useState<GeneralLedgerResult>(initialReport);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLedger = async (accId = selectedAccountId, sDate = startDate, eDate = endDate) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        accountId: accId,
        startDate: sDate,
        endDate: eDate,
      });
      const res = await fetch(`/api/accounting/ledger?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal memuat buku besar.", "error");
        return;
      }
      setReport(data.data);
    } catch {
      showToast("Terjadi kesalahan jaringan saat memuat buku besar.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLedger();
  };

  const handlePresetMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const sDate = `${year}-${month}-01`;
    const eDate = jakartaDateKey(today);
    setStartDate(sDate);
    setEndDate(eDate);
    fetchLedger(selectedAccountId, sDate, eDate);
  };

  const isDebitNormal = report.account.normalBalance === "DEBIT";

  return (
    <div className="space-y-6">
      {/* Filter and Account Selector Card */}
      <section className="aj-surface p-5">
        <form onSubmit={handleApply} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-wrap gap-4">
            <div className="w-full sm:w-80">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Pilih Akun Perkiraan
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  fetchLedger(e.target.value, startDate, endDate);
                }}
                className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-hidden"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-hidden"
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
                className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={handlePresetMonth}>
              Bulan Ini
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Memuat..." : "Tampilkan"}
            </Button>
          </div>
        </form>
      </section>

      {/* Account Info & KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo Awal</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {formatCurrency(report.openingBalance)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Per {formatJakartaDate(report.period.startDate)} (Normal: {report.account.normalBalance})
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Mutasi Debit</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-800 font-mono tabular-nums">
            {formatCurrency(report.totalDebit)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {isDebitNormal ? "Penambahan saldo" : "Pengurangan saldo"}
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Mutasi Kredit</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-rose-800 font-mono tabular-nums">
            {formatCurrency(report.totalCredit)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {isDebitNormal ? "Pengurangan saldo" : "Penambahan saldo"}
          </p>
        </section>

        <section className="aj-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo Akhir</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {formatCurrency(report.endingBalance)}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Per {formatJakartaDate(report.period.endDate)}
          </p>
        </section>
      </div>

      {/* Ledger Table */}
      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold text-slate-900">{report.account.code}</span>
            <span className="text-sm font-semibold text-slate-800">— {report.account.name}</span>
            <span className="rounded-xs bg-slate-200/70 px-2 py-0.5 text-[11px] font-bold text-slate-700 uppercase">
              {report.account.category}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {formatJakartaDate(report.period.startDate)} s/d {formatJakartaDate(report.period.endDate)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 w-28">Tanggal</th>
                <th className="py-2.5 px-4 w-36">No. Jurnal</th>
                <th className="py-2.5 px-4 w-28">Tipe</th>
                <th className="py-2.5 px-4">Keterangan / Memo</th>
                <th className="py-2.5 px-4 w-36 text-right">Debit (Rp)</th>
                <th className="py-2.5 px-4 w-36 text-right">Kredit (Rp)</th>
                <th className="py-2.5 px-4 w-40 text-right">Saldo Berjalan (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Row 0: Opening Balance */}
              <tr className="bg-slate-50/75 font-semibold text-slate-700">
                <td className="py-2.5 px-4 font-mono">{formatJakartaDate(report.period.startDate)}</td>
                <td className="py-2.5 px-4 font-mono text-slate-400">-</td>
                <td className="py-2.5 px-4">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-bold bg-slate-200 text-slate-800">
                    SALDO AWAL
                  </span>
                </td>
                <td className="py-2.5 px-4 italic text-slate-600">Saldo awal sebelum periode berjalan</td>
                <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                  {formatCurrency(report.openingBalance)}
                </td>
              </tr>

              {/* Mutations */}
              {report.mutations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada mutasi transaksi untuk akun ini dalam periode yang dipilih.
                  </td>
                </tr>
              ) : (
                report.mutations.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-700">{formatJakartaDate(m.date)}</td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{m.journalNumber}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{m.tipeCodeSnapshot || "-"}</td>
                    <td className="py-2.5 px-4 text-slate-800">
                      <span>{m.description}</span>
                      {m.memo && <span className="block text-[11px] text-slate-500 font-mono mt-0.5">{m.memo}</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      {m.debit > 0 ? formatCurrency(m.debit) : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      {m.credit > 0 ? formatCurrency(m.credit) : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(m.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={4} className="py-3 px-4 text-right uppercase tracking-wider text-slate-700">
                  Total Mutasi & Saldo Akhir
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-800">
                  {formatCurrency(report.totalDebit)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-800">
                  {formatCurrency(report.totalCredit)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 text-sm">
                  {formatCurrency(report.endingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
