"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { locationLabel, type InvLocation } from "./labels";

/** Posting GRN pembelian (yang belum masuk stok) ke gudang/toko. */
export function GrnPostForm({ receiptId, locations }: { receiptId: string; locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function post() {
    if (!locationId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/purchase-receipts/${receiptId}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId }) });
      const json = await res.json();
      if (!json.success) showToast(json.message || "Gagal posting GRN.", "error");
      else { showToast("GRN masuk ke stok.", "success"); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Lokasi tujuan" className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
        {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
      </select>
      <button type="button" disabled={busy || !locationId} onClick={post} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? "..." : "Masukkan ke stok"}</button>
    </div>
  );
}
