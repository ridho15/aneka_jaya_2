"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { FileUpload } from "@/components/ui/FileUpload";
import { LocalAttachmentPreview } from "@/components/attachments/LocalAttachmentPreview";
import { useToast } from "@/components/ui/ToastProvider";
import { formatCurrency } from "@/lib/currency";
import { jakartaDateKey } from "@/lib/date/jakarta";
import type { RekeningAccount } from "@/lib/business/masterData";

type ActiveLoanOption = {
  id: string;
  amount: number;
  remainingAmount: number;
  purpose: string | null;
  expenseRecord: {
    expenseDate: string;
    expenseNumber?: string | null;
  };
};

type Props = {
  employeeId: string;
  employeeName: string;
  activeLoans: ActiveLoanOption[];
  rekenings: RekeningAccount[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function LoanRepaymentModal({
  employeeName,
  activeLoans,
  rekenings,
  isOpen,
  onClose,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const [selectedLoanId, setSelectedLoanId] = useState<string>(activeLoans[0]?.id || "");
  const [amount, setAmount] = useState<number>(activeLoans[0]?.remainingAmount || 0);
  const [paymentDate, setPaymentDate] = useState<string>(jakartaDateKey());
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "CASH" | "POTONG_GAJI">("TRANSFER");
  const [rekeningId, setRekeningId] = useState<string>(rekenings[0]?.id || "");
  const [payrollReference, setPayrollReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentLoan = activeLoans.find((l) => l.id === selectedLoanId) || activeLoans[0];
  const maxRepayment = currentLoan ? currentLoan.remainingAmount : 0;

  const handleLoanChange = (loanId: string) => {
    setSelectedLoanId(loanId);
    const loan = activeLoans.find((l) => l.id === loanId);
    if (loan) setAmount(loan.remainingAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanId) {
      showToast("Pilih kasbon yang akan dilunasi.", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Nominal pelunasan harus lebih dari Rp 0.", "error");
      return;
    }
    if (amount > maxRepayment) {
      showToast(`Nominal pelunasan melebihi sisa kasbon (${formatCurrency(maxRepayment)}).`, "error");
      return;
    }
    if (paymentMethod === "POTONG_GAJI" && !payrollReference.trim() && !notes.trim()) {
      showToast("Wajib menyertakan referensi slip/periode gaji untuk metode potong gaji.", "error");
      return;
    }
    if ((paymentMethod === "CASH" || paymentMethod === "TRANSFER") && !rekeningId) {
      showToast("Rekening kas/bank penerima wajib dipilih.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      let attachmentUrl = "";
      if (file) {
        const uploadData = new FormData();
        uploadData.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadData });
        const uploadResult = await uploadRes.json();
        if (!uploadRes.ok || !uploadResult.success) {
          showToast(uploadResult.message || "Gagal mengunggah bukti pelunasan.", "error");
          setIsSubmitting(false);
          return;
        }
        attachmentUrl = uploadResult.data.url;
      }

      const selectedRek = rekenings.find((r) => r.id === rekeningId);

      const res = await fetch(`/api/sdm/loans/${encodeURIComponent(selectedLoanId)}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: selectedLoanId,
          amount,
          paymentDate,
          paymentMethod,
          rekeningId: paymentMethod !== "POTONG_GAJI" ? rekeningId : undefined,
          rekeningNameSnapshot: paymentMethod !== "POTONG_GAJI" && selectedRek ? selectedRek.name : undefined,
          payrollReference: paymentMethod === "POTONG_GAJI" ? payrollReference.trim() : undefined,
          notes: notes.trim() || undefined,
          attachmentUrl: attachmentUrl || undefined
        })
      });
      const result = await res.json();

      if (result.success) {
        showToast("Pelunasan kasbon berhasil dicatat.", "success");
        onSuccess();
        onClose();
      } else {
        const errDetail = result.errors ? Object.values(result.errors).join("; ") : null;
        showToast(errDetail || result.message || "Gagal mencatat pelunasan kasbon.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat mencatat pelunasan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm transition-opacity duration-150">
      <div className="w-full max-w-lg rounded-sm bg-white p-5 sm:p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Catat Pelunasan Kasbon</h3>
            <p className="text-xs text-slate-500">Karyawan: <span className="font-semibold text-slate-800">{employeeName}</span></p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup dialog"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Pilih Transaksi Kasbon yang Dilunasi *</label>
            <Select
              value={selectedLoanId}
              onChange={(e) => handleLoanChange(e.target.value)}
              className="mt-1"
            >
              {activeLoans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.expenseRecord.expenseDate} — Total: {formatCurrency(loan.amount)} (Sisa: {formatCurrency(loan.remainingAmount)}) {loan.purpose ? `— ${loan.purpose}` : ""}
                </option>
              ))}
            </Select>
            {currentLoan && (
              <p className="mt-1 text-xs text-slate-600">
                Sisa kewajiban kasbon ini: <span className="font-bold text-amber-700">{formatCurrency(currentLoan.remainingAmount)}</span>
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Tanggal Pelunasan *</label>
              <Input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Metode Pelunasan *</label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "TRANSFER" | "POTONG_GAJI")}
                className="mt-1"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai (Kas)</option>
                <option value="POTONG_GAJI">Potong Gaji (Payroll)</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nominal Pelunasan *</label>
            <MoneyInput
              value={amount}
              min={1}
              max={maxRepayment}
              onValueChange={(val) => setAmount(val)}
              className="mt-1"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Maksimal: {formatCurrency(maxRepayment)}</span>
              <button
                type="button"
                onClick={() => setAmount(maxRepayment)}
                className="font-medium text-emerald-600 hover:text-emerald-700"
              >
                Lunasi Penuh
              </button>
            </div>
          </div>

          {paymentMethod !== "POTONG_GAJI" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Rekening Kas/Bank Penerima *</label>
              <Select
                value={rekeningId}
                onChange={(e) => setRekeningId(e.target.value)}
                className="mt-1"
              >
                {rekenings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.bank})
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-slate-500">
                Uang masuk akan menambah saldo rekening ini.
              </span>
            </div>
          ) : (
            <div className="rounded border border-indigo-200 bg-indigo-50/80 p-3">
              <label className="block text-xs font-semibold text-indigo-950">Referensi Slip / Potong Gaji *</label>
              <Input
                required
                value={payrollReference}
                onChange={(e) => setPayrollReference(e.target.value)}
                placeholder="Contoh: Potongan Slip Gaji Periode Oktober 2026"
                className="mt-1 bg-white"
              />
              <p className="mt-1.5 text-xs text-indigo-900 leading-relaxed">
                <span className="font-semibold">Catatan:</span> Metode <b>Potong Gaji</b> mengurangi saldo piutang kasbon karyawan tanpa menambah saldo fisik kas/bank perusahaan (pencatatan non-tunai via penggajian).
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Catatan Pelunasan</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Keterangan tambahan (opsional)"
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Upload Bukti Setor / Transfer</label>
            <div className="mt-1">
              <FileUpload onFileChange={setFile} />
              <LocalAttachmentPreview file={file} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Pelunasan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
