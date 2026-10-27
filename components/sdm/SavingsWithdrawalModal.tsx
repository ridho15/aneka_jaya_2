"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";

export type SavingsAccountOption = {
  id: string;
  accountNumber: string;
  balance: number;
  employee: {
    id: string;
    name: string;
    nik?: string | null;
    department: string;
  };
};

export type RekeningOption = {
  id: string;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
};

type Props = {
  accounts: SavingsAccountOption[];
  rekenings: RekeningOption[];
  defaultAccountId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function SavingsWithdrawalModal({
  accounts,
  rekenings,
  defaultAccountId,
  isOpen,
  onClose,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId || accounts[0]?.id || ""
  );
  const [amount, setAmount] = useState<number>(0);
  const [transactionDate, setTransactionDate] = useState<string>(jakartaDateKey());
  const [rekeningAccountId, setRekeningAccountId] = useState<string>(rekenings[0]?.id || "");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const availableBalance = currentAccount ? Number(currentAccount.balance) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) {
      showToast("Pilih rekening simpanan karyawan.", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Nominal penarikan harus lebih dari Rp 0.", "error");
      return;
    }
    if (amount > availableBalance) {
      showToast(
        `Nominal penarikan (${formatCurrency(amount)}) melebihi saldo tabungan tersedia (${formatCurrency(availableBalance)}).`,
        "error"
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/sdm/savings/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdrawal",
          employeeId: currentAccount.employee.id,
          amount,
          transactionDate,
          rekeningAccountId: rekeningAccountId || null,
          notes: notes.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memproses penarikan simpanan.");
      }

      showToast(`Penarikan simpanan ${formatCurrency(amount)} berhasil diproses.`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan saat memproses penarikan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="aj-surface w-full max-w-lg border border-slate-200 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-100">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 uppercase">
              Tarik Simpanan Karyawan
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pencairan tabungan internal karyawan dari kas / rekening perusahaan
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-sm font-semibold transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Pilih Rekening Simpanan Karyawan
            </label>
            <Select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setAmount(0);
              }}
              className="w-full"
              required
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.employee.name} ({acc.accountNumber}) - Saldo: {formatCurrency(acc.balance)}
                </option>
              ))}
            </Select>

            {currentAccount && (
              <div className="mt-2 flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-500">Saldo Simpanan Tersedia:</span>
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(availableBalance)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                Nominal Penarikan
              </label>
              <MoneyInput
                value={amount}
                onValueChange={setAmount}
                placeholder="Rp 0"
                className="w-full text-sm font-semibold"
                required
              />
              {amount > availableBalance && (
                <p className="text-xs text-rose-600 mt-1">Melebihi saldo simpanan tersedia!</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                Tanggal Transaksi
              </label>
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Rekening Kas / Bank Pencairan
            </label>
            <Select
              value={rekeningAccountId}
              onChange={(e) => setRekeningAccountId(e.target.value)}
              className="w-full text-xs"
            >
              {rekenings.map((rek) => (
                <option key={rek.id} value={rek.id}>
                  {rek.name} {rek.bankName ? `(${rek.bankName})` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Catatan / Alasan Penarikan
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pencairan tabungan untuk keperluan keluarga"
              className="w-full text-xs"
            />
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-900 uppercase tracking-wider">Jurnal Otomatis:</span>
            <div className="mt-1 flex justify-between">
              <span>Debit: Utang Simpanan Karyawan (2-1003)</span>
              <span className="font-medium text-slate-900">{formatCurrency(amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kredit: Kas & Bank (1-1001 / Rekening Terkait)</span>
              <span className="font-medium text-slate-900">{formatCurrency(amount || 0)}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || amount <= 0 || amount > availableBalance}
            >
              {isSubmitting ? "Memproses..." : "Cairkan Simpanan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
