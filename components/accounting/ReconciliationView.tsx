"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import type {
  AccountingReconciliationReport,
  ReconciliationItem,
  LegacyExpenseAuditItem
} from "@/lib/accounting/reconciliationStore";

interface Props {
  initialReport: AccountingReconciliationReport;
  employees: Array<{ id: string; name: string }>;
}

export function ReconciliationView({ initialReport, employees }: Props) {
  const { showToast } = useToast();
  const [report, setReport] = useState<AccountingReconciliationReport>(initialReport);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAuditItem, setSelectedAuditItem] = useState<LegacyExpenseAuditItem | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [isReclassifying, setIsReclassifying] = useState(false);

  const refreshReport = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/accounting/reconciliation");
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || "Gagal memperbarui rekonsiliasi.", "error");
        return;
      }
      setReport(json.data);
      showToast("Data rekonsiliasi berhasil disegarkan.", "success");
    } catch {
      showToast("Terjadi gangguan jaringan saat memuat rekonsiliasi.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReclassify = async () => {
    if (!selectedAuditItem) return;

    setIsReclassifying(true);
    try {
      const res = await fetch("/api/accounting/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId: selectedAuditItem.id,
          newCategoryCode: selectedAuditItem.suggestedCategoryCode,
          employeeId: selectedEmployeeId || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal mereklasifikasi pengeluaran.");
      }

      showToast(json.message || "Reklasifikasi berhasil.", "success");
      setSelectedAuditItem(null);
      setSelectedEmployeeId("");
      await refreshReport();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsReclassifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Status */}
      <section
        className={`aj-surface p-5 border-l-4 ${
          report.isOverallReconciled
            ? "border-l-emerald-600 bg-emerald-50/40"
            : "border-l-amber-600 bg-amber-50/40"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-base font-bold ${
                  report.isOverallReconciled ? "text-emerald-900" : "text-amber-900"
                }`}
              >
                {report.isOverallReconciled
                  ? "STATUS REKONSILIASI: SELURUH SUBLEDGER & BUKU BESAR COCOK"
                  : `PERHATIAN: DITEMUKAN ${report.totalSubledgerDiscrepancies} KETIDAKSESUAIAN SUBLEDGER`}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                  report.isOverallReconciled
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-amber-100 text-amber-800 border border-amber-300"
                }`}
              >
                {report.isOverallReconciled ? "Tervalidasi" : "Perlu Penelusuran"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Sinkronisasi data buku besar (General Ledger) dengan subledger SDM (Kasbon, Uang Muka, Simpanan) serta transaksi operasional.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={refreshReport}
            disabled={isLoading}
            className="self-start sm:self-auto text-xs"
          >
            {isLoading ? "Menyegarkan..." : "Segarkan Status"}
          </Button>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="aj-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Ketidaksesuaian Subledger
          </span>
          <p className="mt-2 text-2xl font-bold font-mono">
            {report.totalSubledgerDiscrepancies}{" "}
            <span className="text-xs font-sans font-normal text-slate-500">akun</span>
          </p>
          <span className="mt-1 block text-xs text-slate-500">
            {report.totalSubledgerDiscrepancies === 0
              ? "Semua subledger sesuai saldo GL"
              : "Periksa tabel verifikasi di bawah"}
          </span>
        </div>

        <div className="aj-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pengeluaran Belum Dijurnal
          </span>
          <p className="mt-2 text-2xl font-bold font-mono text-amber-700">
            {report.expensePostingStatus.unpostedExpensesCount}{" "}
            <span className="text-xs font-sans font-normal text-slate-500">transaksi</span>
          </p>
          <span className="mt-1 block text-xs text-slate-500">
            Nominal: {formatCurrency(report.expensePostingStatus.unpostedExpensesAmount)}
          </span>
        </div>

        <div className="aj-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pengeluaran Historis Perlu Review
          </span>
          <p className="mt-2 text-2xl font-bold font-mono text-indigo-700">
            {report.legacyAuditItems.length}{" "}
            <span className="text-xs font-sans font-normal text-slate-500">antrean review</span>
          </p>
          <span className="mt-1 block text-xs text-slate-500">
            Mencegah perubahan laba rugi otomatis
          </span>
        </div>
      </div>

      {/* Section 1: Subledger vs General Ledger Equilibrium Table */}
      <section className="aj-surface p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            1. Verifikasi Subledger vs Akun Buku Besar (Equilibrium Matrix)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Memastikan saldo subledger operasional (daftar terbuka) sama persis dengan saldo akhir akun perkiraan di neraca.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Modul & Akun Buku Besar</th>
                <th className="py-2.5 px-3">Sumber Subledger</th>
                <th className="py-2.5 px-3 text-right">Saldo Subledger</th>
                <th className="py-2.5 px-3 text-right">Saldo Buku Besar (GL)</th>
                <th className="py-2.5 px-3 text-right">Selisih</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-bold text-slate-900 block">{item.name}</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      Akun {item.accountCode} - {item.accountName}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{item.subledgerSource}</td>
                  <td className="py-3 px-3 text-right font-mono font-medium">
                    {formatCurrency(item.subledgerBalance)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium">
                    {formatCurrency(item.generalLedgerBalance)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold">
                    <span
                      className={
                        item.isReconciled
                          ? "text-slate-500"
                          : item.difference > 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }
                    >
                      {item.isReconciled ? "Rp 0" : formatCurrency(item.difference)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        item.isReconciled
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.isReconciled ? "✓ Cocok" : "✕ Selisih"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <Link
                      href={`/akuntansi/buku-besar?account=${item.accountCode}`}
                      className="text-emerald-600 hover:text-emerald-800 font-semibold underline"
                    >
                      Buku Besar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Legacy Expenses Manual Audit Review Table */}
      <section className="aj-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              2. Daftar Review Manual: Pengeluaran Historis (Legacy Expenses Audit)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuai panduan arsitektur SLM: Pengeluaran historis dengan teks kasbon/gaji tidak otomatis mengubah laba rugi masa lalu, melainkan masuk antrean verifikasi manual.
            </p>
          </div>
        </div>

        {report.legacyAuditItems.length === 0 ? (
          <div className="rounded border border-emerald-200 bg-emerald-50/50 p-6 text-center text-xs text-emerald-800">
            ✓ Seluruh pengeluaran historis telah terklasifikasi dengan benar. Tidak ada antrean review manual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Penerima / Vendor</th>
                  <th className="py-2.5 px-3">Deskripsi Lama</th>
                  <th className="py-2.5 px-3 text-right">Nominal</th>
                  <th className="py-2.5 px-3">Rekomendasi Akuntansi</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.legacyAuditItems.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-mono">{candidate.expenseDate}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {candidate.vendorName}
                    </td>
                    <td className="py-3 px-3 text-slate-700 max-w-xs truncate">
                      {candidate.description}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(candidate.amount)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {candidate.suggestedAccountName} ({candidate.suggestedAccountCode})
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        {candidate.reason}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSelectedAuditItem(candidate);
                          setSelectedEmployeeId("");
                        }}
                        className="text-xs"
                      >
                        Tinjau & Reklasifikasi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reclassification Modal */}
      {selectedAuditItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-sm border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-900 text-sm">
                Reklasifikasi Pengeluaran Historis
              </h4>
              <button
                type="button"
                onClick={() => setSelectedAuditItem(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                <p>
                  <b>Deskripsi:</b> {selectedAuditItem.description}
                </p>
                <p>
                  <b>Penerima / Vendor:</b> {selectedAuditItem.vendorName}
                </p>
                <p>
                  <b>Nominal:</b> {formatCurrency(selectedAuditItem.amount)}
                </p>
                <p>
                  <b>Rekomendasi:</b> {selectedAuditItem.suggestedAccountName} (
                  {selectedAuditItem.suggestedCategoryCode})
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Karyawan Terkait (Opsional / Dianjurkan)
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">— Tanpa Relasi Karyawan / Tetap Seperti Asal —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-slate-500">
                  Jika dipilih, transaksi ini akan otomatis tercatat di subledger SDM karyawan bersangkutan.
                </span>
              </div>

              <div className="p-3 bg-amber-50 rounded border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                Tindakan ini akan memperbarui kategori transaksi lama dan mencatat jejak audit (Audit Trail) tanpa menghapus rekaman fisik atau menjurnal dua kali.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedAuditItem(null)}
                disabled={isReclassifying}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleReclassify}
                disabled={isReclassifying}
              >
                {isReclassifying ? "Menyimpan..." : "Konfirmasi Reklasifikasi"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
