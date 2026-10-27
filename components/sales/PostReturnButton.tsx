"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PostReturnButton({
  returnId,
  returnNumber
}: {
  returnId: string;
  returnNumber: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    if (!confirm(`Konfirmasi posting resmi retur ${returnNumber}? Jurnal umum dan pemotongan piutang/kas akan dibukukan secara permanen.`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/sales/returns/${returnId}/post`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || "Gagal memposting retur penjualan.");
        return;
      }
      router.refresh();
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePost}
      disabled={loading}
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
    >
      {loading ? "Posting..." : "Posting Jurnal"}
    </button>
  );
}
