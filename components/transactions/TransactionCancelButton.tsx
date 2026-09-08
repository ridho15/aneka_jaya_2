"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

export function TransactionCancelButton({
  id,
  kind,
  disabled,
  disabledReason,
  triggerClassName,
  transactionLabel,
  triggerLabel
}: {
  id: string;
  kind: "sales" | "expenses";
  disabled?: boolean;
  disabledReason?: string;
  triggerClassName?: string;
  transactionLabel?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    if (disabled || busy) return;
    setError(null);
    setReason("");
    setOpen(true);
  };

  const closeDialog = () => {
    if (!busy) setOpen(false);
  };

  const cancel = async () => {
    setError(null);
    if (!reason.trim()) {
      setError("Alasan pembatalan wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const errMsg = result?.message || "Pembatalan gagal diproses.";
        setError(errMsg);
        showToast(errMsg, "error");
        return;
      }
      setOpen(false);
      showToast(
        `${kind === "sales" ? "Transaksi penjualan" : "Pengeluaran"} berhasil dibatalkan.`,
        "success"
      );
      router.refresh();
    } catch {
      const netErr = "Pembatalan gagal diproses. Periksa koneksi lalu coba lagi.";
      setError(netErr);
      showToast(netErr, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled || busy}
        title={disabled ? disabledReason : undefined}
        className={
          triggerClassName ||
          "font-semibold text-rose-700 hover:text-rose-800 disabled:cursor-not-allowed disabled:text-slate-400 transition-colors"
        }
      >
        {triggerLabel || "Cancel"}
      </button>

      <ConfirmationModal
        isOpen={open}
        title={`Batalkan ${kind === "sales" ? "Transaksi Penjualan" : "Pengeluaran"}?`}
        description={
          <div className="space-y-1 text-sm text-slate-600">
            {transactionLabel && (
              <p className="font-semibold text-slate-900">{transactionLabel}</p>
            )}
            <p>
              Pembatalan akan dicatat dalam audit trail dan status transaksi akan diubah menjadi batal.
            </p>
          </div>
        }
        confirmLabel="Batalkan Transaksi"
        cancelLabel="Kembali"
        variant="danger"
        isLoading={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={cancel}
        onCancel={closeDialog}
      >
        <div className="space-y-1.5 pt-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Alasan Pembatalan <span className="text-rose-500">*</span>
          </label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            disabled={busy}
            rows={3}
            placeholder="Jelaskan secara rinci alasan transaksi dibatalkan..."
            className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-slate-100"
          />
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
      </ConfirmationModal>
    </>
  );
}
