"use client";

import { useState } from "react";

export function ErpRetryButton({ id, kind = "sales" }: { id: string; kind?: "sales" | "expenses" }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/erp-sync/${kind}/${encodeURIComponent(id)}/retry`, { method: "POST" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(body?.message || (response.ok ? "Retry berhasil." : "Retry gagal."));
      if (response.ok) window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return <div className="space-y-1"><button type="button" onClick={retry} disabled={loading} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Retry..." : "Retry"}</button>{message && <p className="max-w-48 text-xs text-slate-500">{message}</p>}</div>;
}
