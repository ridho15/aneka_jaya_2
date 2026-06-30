"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProductDeactivateButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setError(null);
    if (!window.confirm("Nonaktifkan barang ini di ERP? Data tidak akan dihapus permanen.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setError(result?.message || "Barang gagal dinonaktifkan.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={deactivate}
        disabled={disabled || busy}
        className="font-semibold text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {busy ? "Nonaktif..." : "Nonaktifkan"}
      </button>
      {error && <span className="max-w-56 text-right text-xs font-medium text-red-600">{error}</span>}
    </span>
  );
}
