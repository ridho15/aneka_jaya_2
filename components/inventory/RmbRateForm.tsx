"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export function RmbRateForm({ rate, updatedAt, updatedBy, rmbProducts, canManage }: { rate: number | null; updatedAt?: string; updatedBy?: string | null; rmbProducts: number; canManage: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(rate ? String(rate) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = Number(value);
    if (!(next > 0)) return showToast("Kurs RMB harus lebih dari 0.", "error");
    if (!window.confirm(`Ganti kurs RMB menjadi Rp ${next.toLocaleString("id-ID")}? Harga modal ${rmbProducts} barang berharga RMB akan dihitung ulang. Harga jual dan nilai stok yang sudah tercatat tidak berubah.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/settings/rmb-rate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate: next }) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan kurs.", "error");
      showToast(`Kurs disimpan. ${json.data.updatedProducts} harga modal dihitung ulang.`, "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aj-surface mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="font-bold text-slate-800">Kurs RMB untuk Harga Modal</h3>
        <p className="mt-1 text-sm text-slate-600">
          Modal per lusin (atau per satuan barang) = <b>Harga RMB per lusin × Kurs</b> + biaya tambahan per lusin. Tidak ada harga per pcs. Saat kurs diganti, hanya <b>harga modal</b> yang ikut berubah.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {rate ? <>Kurs aktif: <b>Rp {rate.toLocaleString("id-ID")}</b> / RMB{updatedAt ? ` • diubah ${new Date(updatedAt).toLocaleString("id-ID")}${updatedBy ? ` oleh ${updatedBy}` : ""}` : ""}</> : "Kurs belum diatur."} • {rmbProducts} barang memakai harga RMB
        </p>
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-sm font-semibold"><span>Kurs (Rp per 1 RMB)</span>
            <input className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="2750" />
          </label>
          <Button onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Kurs"}</Button>
        </div>
      )}
    </div>
  );
}
