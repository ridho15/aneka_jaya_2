"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { formatJakartaDate } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";

export type JournalDetailRow = {
  id: string;
  entryNumber: string;
  entryDate: string | Date;
  sourceType: string;
  sourceId?: string | null;
  sourceRef?: string | null;
  description: string;
  status: "POSTED" | "REVERSED";
  reversedAt?: string | Date | null;
  reversalReason?: string | null;
  createdByName?: string | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    description?: string | null;
    debit: number;
    credit: number;
    account: {
      id: string;
      code: string;
      name: string;
      category: string;
      normalBalance: string;
    };
  }>;
};

type Props = {
  journal: JournalDetailRow | null;
  onClose: () => void;
  onJournalReversed?: () => void;
};

export function JournalDetailModal({ journal, onClose, onJournalReversed }: Props) {
  const { showToast } = useToast();
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!journal) return null;

  const totalDebit = journal.lines.reduce((acc, l) => acc + Number(l.debit || 0), 0);
  const totalCredit = journal.lines.reduce((acc, l) => acc + Number(l.credit || 0), 0);

  const handleReverse = async () => {
    if (!reversalReason.trim()) {
      showToast("Alasan pembalikan jurnal wajib diisi.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/accounting/journals/${journal.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal membalik jurnal.", "error");
        return;
      }

      showToast("Jurnal pembalik (reversal) berhasil diterbitkan.", "success");
      setShowReverseConfirm(false);
      onJournalReversed?.();
      onClose();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="aj-surface w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-800">{journal.entryNumber}</span>
              <span
                className={`inline-flex items-center rounded-xs px-2 py-0.5 text-xs font-semibold ${
                  journal.status === "POSTED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {journal.status === "POSTED" ? "TERBUKUKAN (POSTED)" : "DIBALIK (REVERSED)"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Tanggal Transaksi: <span className="font-mono">{formatJakartaDate(journal.entryDate)}</span>
              {journal.createdByName && ` • Dibuat oleh: ${journal.createdByName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xs border border-slate-200 bg-slate-50/50 p-4 text-xs">
            <div>
              <p className="font-semibold text-slate-500 uppercase">Tipe Sumber</p>
              <p className="mt-1 font-mono font-medium text-slate-900">{journal.sourceType}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500 uppercase">Referensi Dokumen</p>
              <p className="mt-1 font-mono font-medium text-slate-900">{journal.sourceRef || "-"}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500 uppercase">Keterangan / Memo</p>
              <p className="mt-1 text-slate-900">{journal.description}</p>
            </div>
          </div>

          {journal.status === "REVERSED" && (
            <div className="rounded-xs border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
              <p className="font-bold">Informasi Pembalikan (Reversal):</p>
              <p className="mt-1">
                Jurnal ini telah dibalik pada {journal.reversedAt ? formatJakartaDate(journal.reversedAt) : "-"}.
                {journal.reversalReason && ` Alasan: "${journal.reversalReason}"`}
              </p>
            </div>
          )}

          {/* Lines Table */}
          <div className="border border-slate-200 rounded-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 w-28">Kode Akun</th>
                  <th className="py-2.5 px-3">Nama Akun & Catatan</th>
                  <th className="py-2.5 px-3 w-36 text-right">Debit (Rp)</th>
                  <th className="py-2.5 px-3 w-36 text-right">Kredit (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journal.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{line.lineNumber}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{line.account.code}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-slate-900">{line.account.name}</span>
                      {line.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{line.description}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {line.debit > 0 ? formatCurrency(line.debit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {line.credit > 0 ? formatCurrency(line.credit) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider text-slate-600">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-800">
                    {formatCurrency(totalDebit)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-800">
                    {formatCurrency(totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Reversal Confirmation Form */}
          {showReverseConfirm && (
            <div className="rounded-xs border border-red-200 bg-red-50/50 p-4 space-y-3">
              <p className="text-xs font-bold text-red-900 uppercase">
                Konfirmasi Pembalikan Jurnal (Reversal)
              </p>
              <p className="text-xs text-red-800">
                Tindakan ini akan membuat jurnal pembalik baru dengan posisi debit dan kredit yang saling meniadakan. Jurnal ini akan ditandai sebagai REVERSED.
              </p>
              <label className="block text-xs font-semibold text-slate-700">
                Alasan Pembalikan (Wajib):
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Misal: Salah input akun beban atau transaksi dibatalkan..."
                  className="mt-1 block w-full rounded-xs border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-red-500 focus:outline-hidden"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="secondary"
                  onClick={() => setShowReverseConfirm(false)}
                  disabled={isSubmitting}
                >
                  Batal
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReverse}
                  disabled={isSubmitting || !reversalReason.trim()}
                >
                  {isSubmitting ? "Memproses..." : "Ya, Terbitkan Jurnal Pembalik"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div>
            {journal.status === "POSTED" && !showReverseConfirm && (
              <Button
                variant="danger"
                onClick={() => setShowReverseConfirm(true)}
              >
                Balikkan Jurnal (Reversal)
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
