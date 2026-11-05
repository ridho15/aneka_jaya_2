"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

/** Tombol aksi baris (mis. terima/batalkan transfer) dengan konfirmasi; alasan bisa diwajibkan. */
export function InventoryActionButton({ endpoint, label, title, description, askReason, variant = "primary", body }: {
  endpoint: string; label: string; title: string; description: string; askReason?: boolean; variant?: "primary" | "danger"; body?: Record<string, unknown>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, reason: reason.trim() || undefined }) });
      const json = await res.json();
      if (!json.success) showToast(json.message || "Gagal.", "error");
      else { showToast("Berhasil disimpan.", "success"); setOpen(false); setReason(""); router.refresh(); }
    } catch {
      showToast("Koneksi terputus. Coba lagi.", "error");
    } finally {
      setBusy(false);
    }
  }

  const cls = variant === "danger" ? "border-red-300 text-red-800 hover:bg-red-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50";
  return (
    <>
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${cls}`}>{label}</button>
      <ConfirmationModal
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={run}
        isLoading={busy}
        title={title}
        description={description}
        variant={variant === "danger" ? "danger" : "primary"}
        confirmText={label}
        confirmDisabled={askReason ? reason.trim().length < 3 : false}
      >
        {askReason && (
          <label className="mt-3 block text-sm font-semibold text-slate-800">
            Alasan (wajib)
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah pilih lokasi tujuan" />
          </label>
        )}
      </ConfirmationModal>
    </>
  );
}
