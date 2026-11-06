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

type Category = AccountRecord["category"];
type NormalBalance = AccountRecord["normalBalance"];

const CATEGORY_LABEL: Record<Category, string> = {
  ASSET: "ASET (Harta)",
  LIABILITY: "LIABILITAS (Kewajiban)",
  EQUITY: "EKUITAS (Modal)",
  REVENUE: "PENDAPATAN (Sales)",
  EXPENSE: "BEBAN (Operasional)"
};

/** Field yang dikirim saat menyimpan: akun sistem hanya nama & keterangan, akun lain hanya yang berubah. */
export function accountSavePayload(
  account: AccountRecord | null,
  form: { code: string; name: string; category: Category; normalBalance: NormalBalance; description: string }
) {
  const name = form.name.trim();
  const description = form.description.trim();
  if (!account) {
    return { code: form.code.trim(), name, category: form.category, normalBalance: form.normalBalance, description: description || undefined };
  }
  const payload: Record<string, string> = {};
  if (name !== account.name) payload.name = name;
  if (description !== (account.description || "")) payload.description = description;
  if (!account.isSystem) {
    if (form.code.trim() !== account.code) payload.code = form.code.trim();
    if (form.category !== account.category) payload.category = form.category;
    if (form.normalBalance !== account.normalBalance) payload.normalBalance = form.normalBalance;
  }
  return payload;
}

export function AccountModal({ isOpen, onClose, accountToEdit, onSuccess }: Props) {
  if (!isOpen) return null;
  // key: formulir dibuat ulang tiap kali akun berganti atau modal dibuka lagi, jadi tidak ada sisa isian akun lain.
  return <AccountForm key={accountToEdit?.id ?? "new"} account={accountToEdit} onClose={onClose} onSuccess={onSuccess} />;
}

function AccountForm({ account, onClose, onSuccess }: { account: AccountRecord | null; onClose: () => void; onSuccess: () => void }) {
  const accountToEdit = account;
  const { showToast } = useToast();
  const isEditing = Boolean(accountToEdit);

  const [code, setCode] = useState(accountToEdit?.code || "");
  const [name, setName] = useState(accountToEdit?.name || "");
  const [category, setCategory] = useState<Category>(accountToEdit?.category || "EXPENSE");
  const [normalBalance, setNormalBalance] = useState<NormalBalance>(accountToEdit?.normalBalance || "DEBIT");
  const [description, setDescription] = useState(accountToEdit?.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystem = Boolean(accountToEdit?.isSystem);

  const handleCategoryChange = (val: Category) => {
    setCategory(val);
    setNormalBalance(val === "ASSET" || val === "EXPENSE" ? "DEBIT" : "CREDIT");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || (!isSystem && !code.trim())) {
      setError(isSystem ? "Nama akun wajib diisi." : "Kode dan nama akun wajib diisi.");
      return;
    }

    const payload = accountSavePayload(accountToEdit, { code, name, category, normalBalance, description });
    if (isEditing && Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const url = isEditing
        ? `/api/accounting/accounts/${accountToEdit!.id}`
        : "/api/accounting/accounts";
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || "Gagal menyimpan akun.");
        return;
      }

      showToast(
        isEditing ? "Akun perkiraan berhasil diperbarui." : "Akun perkiraan baru berhasil ditambahkan.",
        "success"
      );
      onSuccess();
      onClose();
    } catch {
      setError("Gagal menyimpan: koneksi terputus. Data akun belum berubah.");
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
            type="button"
            aria-label="Tutup"
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
              required={!isSystem}
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
              aria-label="Nama Akun"
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
                  handleCategoryChange(e.target.value as Category)
                }
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 font-mono"
              >
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((key) => (
                  <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Saldo Normal</label>
              <select
                disabled={isSystem}
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value as NormalBalance)}
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

          {error && (
            <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}

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
