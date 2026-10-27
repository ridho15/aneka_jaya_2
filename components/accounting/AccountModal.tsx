"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export type AccountRecord = {
  id: string;
  code: string;
  name: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  normalBalance: "DEBIT" | "CREDIT";
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit: AccountRecord | null;
  onSuccess: () => void;
};

export function AccountModal({ isOpen, onClose, accountToEdit, onSuccess }: Props) {
  const { showToast } = useToast();
  const isEditing = Boolean(accountToEdit);

  const [code, setCode] = useState(accountToEdit?.code || "");
  const [name, setName] = useState(accountToEdit?.name || "");
  const [category, setCategory] = useState<"ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE">(
    accountToEdit?.category || "EXPENSE"
  );
  const [normalBalance, setNormalBalance] = useState<"DEBIT" | "CREDIT">(
    accountToEdit?.normalBalance || "DEBIT"
  );
  const [description, setDescription] = useState(accountToEdit?.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isSystem = Boolean(accountToEdit?.isSystem);

  const handleCategoryChange = (val: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE") => {
    setCategory(val);
    if (val === "ASSET" || val === "EXPENSE") {
      setNormalBalance("DEBIT");
    } else {
      setNormalBalance("CREDIT");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast("Kode dan Nama akun wajib diisi.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        category,
        normalBalance,
        description: description.trim() || undefined,
      };

      const url = isEditing
        ? `/api/accounting/accounts/${accountToEdit!.id}`
        : "/api/accounting/accounts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Gagal menyimpan akun.", "error");
        return;
      }

      showToast(
        isEditing ? "Akun perkiraan berhasil diperbarui." : "Akun perkiraan baru berhasil ditambahkan.",
        "success"
      );
      onSuccess();
      onClose();
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="aj-surface w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? "Edit Akun Perkiraan" : "Tambah Akun Perkiraan (COA)"}
            </h3>
            <p className="text-xs text-slate-500">
              {isSystem
                ? "Akun sistem bawaan — kode dan kategori dikunci demi konsistensi posting jurnal otomatis."
                : "Pengaturan akun untuk bagan akun umum UKM."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Kode Akun</label>
            <input
              type="text"
              required
              disabled={isSystem}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Contoh: 6-1005"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono focus:border-emerald-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
            />
            {isSystem && (
              <p className="mt-1 text-[11px] text-amber-700">Kode akun sistem tidak dapat diubah.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nama Akun</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Beban Pemeliharaan Bangunan"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Kategori</label>
              <select
                disabled={isSystem}
                value={category}
                onChange={(e) =>
                  handleCategoryChange(
                    e.target.value as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"
                  )
                }
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 font-mono"
              >
                <option value="ASSET">ASET (Harta)</option>
                <option value="LIABILITY">LIABILITAS (Kewajiban)</option>
                <option value="EQUITY">EKUITAS (Modal)</option>
                <option value="REVENUE">PENDAPATAN (Sales)</option>
                <option value="EXPENSE">BEBAN (Operasional)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Saldo Normal</label>
              <select
                disabled={isSystem}
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value as "DEBIT" | "CREDIT")}
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 font-mono"
              >
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">KREDIT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Keterangan / Fungsi Akun (Opsional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Penjelasan tujuan penggunaan akun ini..."
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Tambahkan Akun"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
