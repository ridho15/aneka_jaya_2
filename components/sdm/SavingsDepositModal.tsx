"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";

export type EmployeeOption = {
  id: string;
  name: string;
  nik?: string | null;
  department: string;
};

export type RekeningOption = {
  id: string;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
};

type Props = {
  employees: EmployeeOption[];
  rekenings: RekeningOption[];
  defaultEmployeeId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function SavingsDepositModal({
  employees,
  rekenings,
  defaultEmployeeId,
  isOpen,
  onClose,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId || employees[0]?.id || "");
  const [amount, setAmount] = useState<number>(0);
  const [transactionDate, setTransactionDate] = useState<string>(jakartaDateKey());
  const [rekeningAccountId, setRekeningAccountId] = useState<string>(rekenings[0]?.id || "");
  const [source, setSource] = useState<"DIRECT_CASH" | "SALARY_DEDUCTION" | "MANUAL_ADJUSTMENT">("DIRECT_CASH");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      showToast("Pilih karyawan terlebih dahulu.", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Nominal setoran harus lebih dari Rp 0.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/sdm/savings/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          employeeId,
          amount,
          transactionDate,
          rekeningAccountId: rekeningAccountId || null,
          source,
          notes: notes.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memproses setoran simpanan.");
      }

      showToast(`Setoran simpanan ${formatCurrency(amount)} berhasil dibukukan.`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan saat memproses setoran.", "error");
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
              Setor Simpanan Karyawan
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Penerimaan tabungan internal ke rekening perusahaan (Double-Entry terhubung)
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
              Karyawan Penyetor
            </label>
            <Select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.nik ? `(${emp.nik})` : ""} - {emp.department}
                </option>
              ))}
            </Select>
            {selectedEmployee && (
              <p className="text-xs text-slate-500 mt-1">
                Departemen: <span className="font-semibold text-slate-900">{selectedEmployee.department}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                Nominal Setoran
              </label>
              <MoneyInput
                value={amount}
                onValueChange={setAmount}
                placeholder="Rp 0"
                className="w-full text-sm font-semibold"
                required
              />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                Rekening Kas / Bank Penerima
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
                Sumber Setoran
              </label>
              <Select
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
                className="w-full text-xs"
              >
                <option value="DIRECT_CASH">Setoran Tunai / Transfer Langsung</option>
                <option value="SALARY_DEDUCTION">Potongan Gaji Bulanan</option>
                <option value="MANUAL_ADJUSTMENT">Penyesuaian Saldo Awal</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Catatan / Keterangan
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Setoran simpanan wajib periode Oktober 2026"
              className="w-full text-xs"
            />
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-900 uppercase tracking-wider">Jurnal Otomatis:</span>
            <div className="mt-1 flex justify-between">
              <span>Debit: Kas & Bank (1-1001 / Rekening Terkait)</span>
              <span className="font-medium text-slate-900">{formatCurrency(amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kredit: Utang Simpanan Karyawan (2-1003)</span>
              <span className="font-medium text-slate-900">{formatCurrency(amount || 0)}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting || amount <= 0}>
              {isSubmitting ? "Memproses..." : "Bukukan Setoran"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
