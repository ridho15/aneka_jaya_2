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
import type { EmployeeLoanRow } from "@/lib/sdm/loanStore";

type Props = {
  loan: EmployeeLoanRow;
  rekenings: RekeningAccount[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AdvanceSettlementModal({
  loan,
  rekenings,
  isOpen,
  onClose,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const loanAmount = Number(loan.amount);
  const [settlementDate, setSettlementDate] = useState<string>(jakartaDateKey());
  const [actualExpenseAmount, setActualExpenseAmount] = useState<number>(loanAmount);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundRekeningId, setRefundRekeningId] = useState<string>(rekenings[0]?.id || "");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleActualChange = (actual: number) => {
    setActualExpenseAmount(actual);
    if (actual < loanAmount) {
      setRefundAmount(loanAmount - actual);
    } else {
      setRefundAmount(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualExpenseAmount < 0) {
      showToast("Realisasi biaya tidak boleh negatif.", "error");
      return;
    }
    if (refundAmount > 0 && !refundRekeningId) {
      showToast("Pilih rekening penampung pengembalian sisa kas.", "error");
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
          showToast(uploadResult.message || "Gagal mengunggah bukti nota pertanggungjawaban.", "error");
          setIsSubmitting(false);
          return;
        }
        attachmentUrl = uploadResult.data.url;
      }

      const selectedRek = rekenings.find((r) => r.id === refundRekeningId);

      const res = await fetch(`/api/sdm/loans/${encodeURIComponent(loan.id)}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: loan.id,
          settlementDate,
          actualExpenseAmount,
          refundAmount,
          refundRekeningId: refundAmount > 0 ? refundRekeningId : undefined,
          refundRekeningSnapshot: refundAmount > 0 && selectedRek ? selectedRek.name : undefined,
          notes: notes.trim() || undefined,
          attachmentUrl: attachmentUrl || undefined
        })
      });
      const result = await res.json();

      if (result.success) {
        showToast("Pertanggungjawaban uang muka berhasil dicatat.", "success");
        onSuccess();
        onClose();
      } else {
        const errDetail = result.errors ? Object.values(result.errors).join("; ") : null;
        showToast(errDetail || result.message || "Gagal mencatat pertanggungjawaban uang muka.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const diff = loanAmount - actualExpenseAmount;
  const isSurplus = diff > 0;
  const isDeficit = diff < 0;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm transition-opacity duration-150">
      <div className="w-full max-w-lg rounded-sm bg-white p-5 sm:p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Pertanggungjawaban Uang Muka</h3>
            <p className="text-xs text-slate-500">
              Karyawan: <span className="font-semibold text-slate-800">{loan.employee.name}</span> • Uang Muka:{" "}
              <span className="font-mono tabular-nums font-bold text-slate-900">{formatCurrency(loanAmount)}</span>
            </p>
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

        {loan.expenseRecord?.approvalStatus && loan.expenseRecord.approvalStatus !== "approved" && (
          <div className="mt-3 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <svg className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-semibold">Catatan Status:</span> Pencairan uang muka ini tercatat status{" "}
              <b>{loan.expenseRecord.approvalStatus}</b>. Pastikan pencairan uang telah disetujui pihak berwenang sebelum menyelesaikan nota fisik.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Tanggal Penyelesaian *</label>
            <Input
              type="date"
              required
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Realisasi Pengeluaran Riil (Total Nota Fisik) *
            </label>
            <MoneyInput
              value={actualExpenseAmount}
              min={0}
              onValueChange={handleActualChange}
              className="mt-1"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Total biaya yang sah sesuai bukti atau nota fisik yang dilaporkan karyawan.
            </span>
          </div>

          {/* Balance comparison helper box */}
          {isSurplus && (
            <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950 flex items-start gap-2.5">
              <svg className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-bold text-emerald-900">
                  Sisa Uang Muka Lebih: <span className="font-mono tabular-nums">{formatCurrency(diff)}</span>
                </p>
                <p className="mt-0.5 text-emerald-800">
                  Karyawan wajib menyetorkan kembali sisa dana ini ke rekening kas perusahaan di bawah.
                </p>
              </div>
            </div>
          )}

          {isDeficit && (
            <div className="rounded-sm border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
              <svg className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold text-amber-900">
                  Realisasi Melebihi Uang Muka: <span className="font-mono tabular-nums">{formatCurrency(Math.abs(diff))}</span>
                </p>
                <p className="mt-0.5 text-amber-800">
                  Perusahaan perlu mengganti (reimburse) kelebihan biaya yang telah ditalangi oleh karyawan.
                </p>
              </div>
            </div>
          )}

          {!isSurplus && !isDeficit && (
            <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 flex items-start gap-2.5">
              <svg className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p>Realisasi pengeluaran tepat sama dengan uang muka yang diberikan ({formatCurrency(loanAmount)}). Tidak ada sisa kas maupun kelebihan biaya.</p>
            </div>
          )}

          {isSurplus && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Pengembalian Kas ke Perusahaan (Refund) *
              </label>
              <MoneyInput
                value={refundAmount}
                min={0}
                onValueChange={(val) => setRefundAmount(val)}
                className="mt-1"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Nominal kas yang disetorkan kembali oleh karyawan.
              </span>
            </div>
          )}

          {refundAmount > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Rekening Kas/Bank Penampung Setoran Sisa *
              </label>
              <Select
                value={refundRekeningId}
                onChange={(e) => setRefundRekeningId(e.target.value)}
                className="mt-1"
              >
                {rekenings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.bank})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Rincian / Catatan Pertanggungjawaban</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Perjalanan dinas proyek selesai, nota terlampir lengkap"
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Upload Bukti Nota / Laporan</label>
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
              {isSubmitting ? "Memproses..." : "Selesaikan Pertanggungjawaban"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
