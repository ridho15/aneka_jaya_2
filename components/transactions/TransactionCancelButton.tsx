"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TransactionCancelButton({ id, kind, disabled, disabledReason }: { id: string; kind: "sales" | "expenses"; disabled?: boolean; disabledReason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setError(null);
    const reason = window.prompt(`Alasan cancel ${kind === "sales" ? "penjualan" : "pengeluaran"}:`);
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setError(result?.message || "Cancel gagal diproses.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={cancel}
        disabled={disabled || busy}
        title={disabled ? disabledReason : undefined}
        className="font-semibold text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {busy ? "Cancel..." : "Cancel"}
      </button>
      {error && <span className="max-w-52 text-xs font-medium text-red-600">{error}</span>}
    </span>
  );
}
