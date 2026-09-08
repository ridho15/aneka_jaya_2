"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

type Props = { tempoId: string; action: "cancel" | "write-off" };

export function TempoActionForm({ tempoId, action }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCancel = action === "cancel";
  const title = isCancel ? "Batalkan Tagihan Tempo" : "Hapus Tagihan (Write-off)";
  const description = isCancel
    ? "Membatalkan seluruh sisa piutang tempo ini. Tindakan ini akan dicatat ke dalam audit trail."
    : "Menghapus sisa tagihan piutang yang tidak tertagih (Bad Debt). Tindakan ini akan dicatat ke dalam audit trail.";

  async function handleConfirm() {
    if (!reason.trim() || reason.trim().length < 5) {
      showToast("Alasan tindakan minimal 5 karakter.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tempo/${tempoId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        showToast(result?.message || `Aksi ${title} gagal diproses.`, "error");
        return;
      }

      setIsOpen(false);
      showToast(`Aksi ${title} berhasil diproses.`, "success");
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan saat memproses aksi.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setIsOpen(true);
        }}
        className={`w-full rounded-xl border p-3 text-center text-xs font-bold transition-all cursor-pointer ${
          isCancel
            ? "border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
        }`}
      >
        {isCancel ? "Batalkan Tagihan Tempo..." : "Hapus Tagihan (Write-off)..."}
      </button>

      <ConfirmationModal
        isOpen={isOpen}
        title={title}
        description={description}
        confirmLabel={isCancel ? "Batalkan Tagihan" : "Hapus Tagihan"}
        cancelLabel="Kembali"
        variant={isCancel ? "danger" : "warning"}
        isLoading={isSubmitting}
        confirmDisabled={reason.trim().length < 5}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!isSubmitting) setIsOpen(false);
        }}
      >
        <div className="space-y-1.5 pt-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Alasan Tindakan <span className="text-rose-500">*</span>
          </label>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            placeholder="Wajib mengisi alasan minimal 5 karakter..."
            className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-slate-100"
          />
          {reason.trim().length > 0 && reason.trim().length < 5 && (
            <p className="text-[11px] font-medium text-rose-500">
              Alasan minimal 5 karakter (tersisa {5 - reason.trim().length} karakter).
            </p>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
