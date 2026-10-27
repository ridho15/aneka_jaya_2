"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";

export type SimpleAccount = {
  id: string;
  code: string;
  name: string;
  category: string;
  normalBalance: string;
};

type JournalLineForm = {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  accounts: SimpleAccount[];
  onSuccess?: () => void;
};

export function ManualJournalModal({ isOpen, onClose, accounts, onSuccess }: Props) {
  const { showToast } = useToast();
  const [entryDate, setEntryDate] = useState(jakartaDateKey(new Date()));
  const [sourceRef, setSourceRef] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLineForm[]>([
    { accountId: accounts[0]?.id || "", debit: 0, credit: 0, description: "" },
    { accountId: accounts[1]?.id || "", debit: 0, credit: 0, description: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && totalCredit > 0 && diff < 0.001;

  const handleLineChange = (index: number, field: keyof JournalLineForm, value: string | number) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { accountId: accounts[0]?.id || "", debit: 0, credit: 0, description: "" },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) {
      showToast("Jurnal berpasangan minimal memiliki 2 baris.", "warning");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      showToast("Keterangan/memo jurnal wajib diisi.", "warning");
      return;
    }

    if (!isBalanced) {
      showToast(
        `Total debit (${formatCurrency(totalDebit)}) dan kredit (${formatCurrency(totalCredit)}) harus tepat seimbang.`,
        "error"
      );
      return;
    }

    const invalidLines = lines.some((l) => !l.accountId || (l.debit <= 0 && l.credit <= 0));
    if (invalidLines) {
      showToast("Setiap baris wajib memilih akun dan mengisi nilai debit atau kredit.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        entryDate,
        sourceRef: sourceRef.trim() || undefined,
        description: description.trim(),
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description.trim() || undefined,
        })),
      };

      const res = await fetch("/api/accounting/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal menyimpan jurnal manual.", "error");
        return;
      }

      showToast("Jurnal manual berhasil dibukukan.", "success");
      onSuccess?.();
      onClose();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="aj-surface w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Input Jurnal Manual (General Journal)</h3>
            <p className="text-xs text-slate-500">
              Pencatatan ayat jurnal penyesuaian, mutasi antar akun, atau koreksi pembukuan.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Header Fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Tanggal Transaksi</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="mt-1 block w-full rounded-xs border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">No. Dokumen / Referensi (Opsional)</label>
                <input
                  type="text"
                  placeholder="Misal: MEMO-2026/001"
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  className="mt-1 block w-full rounded-xs border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Keterangan / Memo Jurnal</label>
                <input
                  type="text"
                  required
                  placeholder="Ringkasan transaksi jurnal..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded-xs border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Lines Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Daftar Ayat Jurnal (Debit & Kredit)
                </span>
                <Button type="button" variant="secondary" onClick={addLine}>
                  + Tambah Baris
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-56">Akun (COA)</th>
                      <th className="py-2.5 px-3">Catatan Baris</th>
                      <th className="py-2.5 px-3 w-36">Debit (Rp)</th>
                      <th className="py-2.5 px-3 w-36">Kredit (Rp)</th>
                      <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(index, "accountId", e.target.value)}
                            className="w-full rounded-xs border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-600 focus:outline-hidden font-mono"
                          >
                            {accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Catatan baris..."
                            value={line.description}
                            onChange={(e) => handleLineChange(index, "description", e.target.value)}
                            className="w-full rounded-xs border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-600 focus:outline-hidden"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.debit || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleLineChange(index, "debit", val);
                              if (val > 0) handleLineChange(index, "credit", 0);
                            }}
                            placeholder="0"
                            className="w-full rounded-xs border border-slate-300 bg-white px-2 py-1.5 text-xs text-right font-mono tabular-nums focus:border-emerald-600 focus:outline-hidden"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.credit || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleLineChange(index, "credit", val);
                              if (val > 0) handleLineChange(index, "debit", 0);
                            }}
                            placeholder="0"
                            className="w-full rounded-xs border border-slate-300 bg-white px-2 py-1.5 text-xs text-right font-mono tabular-nums focus:border-emerald-600 focus:outline-hidden"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            className="text-slate-400 hover:text-red-600 font-bold px-1"
                            title="Hapus baris"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={2} className="py-2.5 px-3 text-right uppercase tracking-wider text-slate-600">
                        Total
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatCurrency(totalDebit)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatCurrency(totalCredit)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Equilibrium Status Indicator */}
            <div
              className={`rounded-xs border p-3 flex items-center justify-between text-xs ${
                isBalanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{isBalanced ? "✓" : "⚠"}</span>
                <span>
                  {isBalanced
                    ? "Jurnal Seimbang (Total Debit == Total Kredit)"
                    : `Jurnal Belum Seimbang: Selisih ${formatCurrency(diff)}`}
                </span>
              </div>
              <span className="font-mono tabular-nums font-semibold">
                Debit: {formatCurrency(totalDebit)} | Kredit: {formatCurrency(totalCredit)}
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={!isBalanced || isSubmitting}>
              {isSubmitting ? "Menyimpan Jurnal..." : "Bukukan Jurnal Manual"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
