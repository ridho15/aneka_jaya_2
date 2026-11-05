"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { locationLabel, type InvLocation } from "./labels";
import { useRememberedLocation } from "./rememberedLocation";

const selectClass = "min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm";
const buttonClass = "min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

async function postReceipt(receiptId: string, locationId: string) {
  const res = await fetch(`/api/inventory/purchase-receipts/${receiptId}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId }) });
  const json = await res.json().catch(() => ({ success: false }));
  return json as { success: boolean; message?: string };
}

/** Lokasi tujuan diingat bersama form Barang Masuk manual. */
function useReceiveLocation(locations: InvLocation[]) {
  const ids = locations.map((l) => l.id);
  const [saved, setSaved] = useRememberedLocation("stock-in", ids);
  return [saved || ids[0] || "", setSaved] as const;
}

/** Posting satu GRN pembelian (yang belum masuk stok) ke gudang/toko. */
export function GrnPostForm({ receiptId, locations }: { receiptId: string; locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useReceiveLocation(locations);
  const [busy, setBusy] = useState(false);
  async function post() {
    if (!locationId) return;
    setBusy(true);
    try {
      const json = await postReceipt(receiptId, locationId);
      if (!json.success) showToast(json.message || "Gagal memasukkan GRN ke stok.", "error");
      else { showToast("GRN masuk ke stok.", "success"); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Lokasi tujuan" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
        {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
      </select>
      <button type="button" disabled={busy || !locationId} onClick={post} className={buttonClass}>{busy ? "Menyimpan..." : "Masukkan ke stok"}</button>
    </div>
  );
}

/** Semua GRN yang tertunda masuk ke satu lokasi sekaligus. */
export function GrnPostAll({ receiptIds, locations }: { receiptIds: string[]; locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useReceiveLocation(locations);
  const [busy, setBusy] = useState(false);
  async function postAll() {
    if (!locationId) return;
    setBusy(true);
    const failed: string[] = [];
    try {
      for (const id of receiptIds) {
        const json = await postReceipt(id, locationId).catch(() => ({ success: false, message: "Koneksi terputus." }));
        if (!json.success) failed.push(json.message || id);
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
    const done = receiptIds.length - failed.length;
    if (!failed.length) showToast(`${done} GRN masuk ke stok.`, "success");
    else showToast(`${done} GRN masuk, ${failed.length} gagal: ${failed[0]}`, "error");
  }
  return (
    <div className="aj-surface mb-3 flex flex-wrap items-center gap-2 p-3">
      <span className="text-sm font-semibold text-slate-700">Masukkan semua ({receiptIds.length} GRN) ke</span>
      <select aria-label="Lokasi tujuan semua GRN" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
        {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
      </select>
      <button type="button" disabled={busy || !locationId} onClick={postAll} className={buttonClass}>{busy ? "Menyimpan..." : "Masukkan semua"}</button>
    </div>
  );
}
