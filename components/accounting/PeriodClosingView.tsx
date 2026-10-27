"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatJakartaDate, jakartaMonthKey } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";

export type PeriodRecord = {
  id: string;
  periodKey: string;
  isClosed: boolean;
  closedAt: string | null;
  closedByNameSnapshot: string | null;
  notes: string | null;
};

type Props = {
  initialPeriods: PeriodRecord[];
};

export function PeriodClosingView({ initialPeriods }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to previous month
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return jakartaMonthKey(today);
  });
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Reopen state
  const [reopenTarget, setReopenTarget] = useState<PeriodRecord | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const handleClosePeriod = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodKey: selectedMonth,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal menutup periode.", "error");
        return;
      }

      showToast(`Periode ${selectedMonth} berhasil ditutup dan dikunci.`, "success");
      setShowConfirmClose(false);
      setNotes("");
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenTarget) return;
    if (!reopenReason.trim()) {
      showToast("Alasan pembukaan kembali periode wajib diisi.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/accounting/periods/${reopenTarget.periodKey}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal membuka kembali periode.", "error");
        return;
      }

      showToast(`Periode ${reopenTarget.periodKey} berhasil dibuka kembali.`, "success");
      setReopenTarget(null);
      setReopenReason("");
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <section className="aj-surface p-5 border-l-4 border-l-amber-500 bg-amber-50/40">
        <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
          Kontrol Integritas & Tutup Buku Akuntansi (Period Lock)
        </h3>
        <p className="mt-1 text-xs text-slate-700 leading-relaxed">
          Tutup buku mengunci seluruh transaksi keuangan (pengeluaran kas, pencairan kasbon, penyelesaian uang muka operasional, gaji, serta jurnal umum). Setelah suatu periode ditutup, sistem menjamin tidak ada mutasi susulan yang dapat mengubah laporan keuangan historis.
        </p>
      </section>

      {/* Close Period Form */}
      <section className="aj-surface p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-4">
          Kunci & Tutup Periode Akuntansi
        </h4>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pilih Periode Bulan (YYYY-MM)
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Penutupan Buku (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Tutup buku bulanan audit internal selesai"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <Button
              type="button"
              variant="danger"
              className="w-full sm:w-auto"
              onClick={() => setShowConfirmClose(true)}
            >
              Kunci Periode {selectedMonth}
            </Button>
          </div>
        </div>

        {/* Confirmation Prompt */}
        {showConfirmClose && (
          <div className="mt-4 rounded border border-red-200 bg-red-50/70 p-4 space-y-3">
            <p className="text-xs font-bold text-red-900">
              Konfirmasi Penguncian Periode: {selectedMonth}
            </p>
            <p className="text-xs text-red-800">
              Apakah Anda yakin ingin mengunci periode {selectedMonth}? Seluruh pengeluaran, jurnal, dan mutasi pada bulan ini tidak akan dapat diubah lagi tanpa otorisasi pembukaan ulang.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => setShowConfirmClose(false)}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                onClick={handleClosePeriod}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Mengunci..." : "Ya, Kunci Periode Ini"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* History Table */}
      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Riwayat Periode Akuntansi & Status Kunci
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 w-36">Periode (Bulan)</th>
                <th className="py-2.5 px-4 w-32 text-center">Status Lock</th>
                <th className="py-2.5 px-4 w-36">Tanggal Ditutup</th>
                <th className="py-2.5 px-4 w-40">Ditutup Oleh</th>
                <th className="py-2.5 px-4">Catatan</th>
                <th className="py-2.5 px-4 w-28 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialPeriods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Belum ada periode akuntansi yang ditutup. Seluruh periode masih terbuka.
                  </td>
                </tr>
              ) : (
                initialPeriods.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                      {p.periodKey}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          p.isClosed
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {p.isClosed ? "TERKUNCI (CLOSED)" : "TERBUKA (OPEN)"}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {p.closedAt ? formatJakartaDate(p.closedAt) : "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-800">
                      {p.closedByNameSnapshot || "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.notes || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.isClosed ? (
                        <Button
                          variant="secondary"
                          className="text-xs py-1 px-2.5 h-auto min-h-0"
                          onClick={() => {
                            setReopenTarget(p);
                            setReopenReason("");
                          }}
                        >
                          Buka Kunci
                        </Button>
                      ) : (
                        <span className="text-slate-400 font-mono">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reopen Modal */}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="aj-surface w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Buka Kunci Periode {reopenTarget.periodKey}
            </h3>
            <p className="text-xs text-slate-600">
              Membuka kembali periode akan mengizinkan entri dan penyesuaian transaksi di bulan bersangkutan. Wajib sertakan alasan pembukaan.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembukaan Kunci (Wajib)
              </label>
              <input
                type="text"
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Contoh: Koreksi ayat jurnal atas instruksi Direksi"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="secondary"
                onClick={() => setReopenTarget(null)}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                onClick={handleReopen}
                disabled={isSubmitting || !reopenReason.trim()}
              >
                {isSubmitting ? "Membuka..." : "Buka Kunci Periode"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
