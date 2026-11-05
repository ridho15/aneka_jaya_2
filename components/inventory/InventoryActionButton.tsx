"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

export function InventoryActionButton({ endpoint, label, confirmText, askReason, variant = "primary", body }: { endpoint: string; label: string; confirmText?: string; askReason?: boolean; variant?: "primary" | "danger"; body?: Record<string, unknown> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    let reason: string | null | undefined;
    if (askReason) {
      reason = window.prompt(confirmText || "Alasan:");
      if (reason === null) return;
    } else if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, reason: reason || undefined }) });
      const json = await res.json();
      if (!json.success) showToast(json.message || "Gagal.", "error");
      else { showToast("Berhasil.", "success"); router.refresh(); }
    } catch {
      showToast("Koneksi gagal.", "error");
    } finally {
      setBusy(false);
    }
  }
  const cls = variant === "danger" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50";
  return <button type="button" disabled={busy} onClick={run} className={`rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${cls}`}>{busy ? "..." : label}</button>;
}
