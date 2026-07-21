"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

export function TransactionCancelButton({ id, kind, disabled, disabledReason, triggerClassName, transactionLabel }: { id: string; kind: "sales" | "expenses"; disabled?: boolean; disabledReason?: string; triggerClassName?: string; transactionLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

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
        setError(result?.message || "Cancel gagal diproses.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Cancel gagal diproses. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled || busy}
        title={disabled ? disabledReason : undefined}
        className={triggerClassName || "font-semibold text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-400"}
      >
        Cancel
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); else event.stopPropagation(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`cancel-title-${id}`} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-red-600">Tindakan permanen</p><h2 id={`cancel-title-${id}`} className="mt-1 text-xl font-bold text-slate-900">Batalkan {kind === "sales" ? "transaksi penjualan" : "pengeluaran"}?</h2></div>
              <button type="button" onClick={closeDialog} disabled={busy} aria-label="Tutup dialog" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
            </div>
            <p className="mt-3 text-sm text-slate-600">{transactionLabel ? <><b className="text-slate-800">{transactionLabel}</b><br /></> : null}Pembatalan akan dicatat dalam audit dan tidak dapat dipulihkan dari halaman ini.</p>
            <label className="mt-5 block text-sm font-semibold text-slate-700">Alasan pembatalan<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} rows={3} placeholder="Jelaskan alasan transaksi dibatalkan" className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100" /></label>
            {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeDialog} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Kembali</button>
              <button type="button" onClick={cancel} disabled={busy || !reason.trim()} className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "Membatalkan..." : "Batalkan transaksi"}</button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </span>
  );
}
