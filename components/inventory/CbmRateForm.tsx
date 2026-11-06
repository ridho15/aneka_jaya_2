"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

export function CbmRateForm({ rate, updatedAt, updatedBy, canManage }: { rate: number | null; updatedAt?: string; updatedBy?: string | null; canManage: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(rate ? String(rate) : "");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const next = Number(value);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/settings/cbm-rate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate: next }) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan tarif CBM.", "error");
      showToast(`Tarif CBM disimpan. ${json.data.updatedProducts} harga modal dihitung ulang.`, "success");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="aj-surface mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="font-bold text-slate-800">Tarif Ongkir per CBM</h3>
        <p className="mt-1 text-sm text-slate-600">Ongkir per satuan = <b>CBM per satuan × tarif</b>, ditambahkan ke modal. Barang dengan tarif khusus di Master Barang tidak ikut berubah.</p>
        <p className="mt-1 text-xs text-slate-600">
          {rate ? <>Tarif aktif: <b>Rp {rate.toLocaleString("id-ID")}</b> / CBM{updatedAt ? ` · diubah ${new Date(updatedAt).toLocaleString("id-ID")}${updatedBy ? ` oleh ${updatedBy}` : ""}` : ""}</> : "Tarif belum diatur."}
        </p>
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-sm font-semibold"><span>Tarif (Rp per CBM)</span>
            <input className="min-h-11 w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="4500000" />
          </label>
          <Button className="min-h-11" onClick={() => (next > 0 ? setConfirmOpen(true) : showToast("Tarif CBM harus lebih dari 0.", "error"))} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Tarif"}</Button>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={save}
        isLoading={busy}
        variant="warning"
        title={`Ganti tarif CBM jadi Rp ${next > 0 ? next.toLocaleString("id-ID") : "-"}?`}
        description="Harga modal barang yang punya harga RMB dihitung ulang. Harga jual dan nilai stok yang sudah tercatat tidak berubah."
        confirmText="Ya, ganti tarif"
      />
    </div>
  );
}
