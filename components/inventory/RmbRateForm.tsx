"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import { RupiahInput } from "@/components/ui/RupiahInput";

export function RmbRateForm({ rate, updatedAt, updatedBy, rmbProducts, canManage }: { rate: number | null; updatedAt?: string; updatedBy?: string | null; rmbProducts: number; canManage: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(rate ? String(Math.round(rate)) : "");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const next = Number(value);

  function ask() {
    if (!(next > 0)) return showToast("Kurs RMB harus lebih dari 0.", "error");
    setConfirmOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/settings/rmb-rate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate: next }) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan kurs.", "error");
      showToast(`Kurs disimpan. ${json.data.updatedProducts} harga modal dihitung ulang.`, "success");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="aj-surface mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="font-bold text-slate-800">Kurs RMB untuk Harga Modal</h3>
        <p className="mt-1 text-sm text-slate-600">
          Modal = <b>Harga RMB × Kurs</b> + biaya tambahan, semuanya per satuan barang (mis. per lusin). Kalau kurs diganti, hanya <b>harga modal</b> yang ikut berubah.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {rate ? <>Kurs aktif: <b>Rp {rate.toLocaleString("id-ID")}</b> / RMB{updatedAt ? ` · diubah ${new Date(updatedAt).toLocaleString("id-ID")}${updatedBy ? ` oleh ${updatedBy}` : ""}` : ""}</> : "Kurs belum diatur."} · {rmbProducts} barang memakai harga RMB
        </p>
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-sm font-semibold"><span>Kurs (Rp per 1 RMB)</span>
            <RupiahInput className="w-48" value={value} onChange={setValue} placeholder="2.750" ariaLabel="Kurs Rp per 1 RMB" />
          </label>
          <Button className="min-h-11" onClick={ask} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Kurs"}</Button>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={save}
        isLoading={busy}
        variant="warning"
        title={`Ganti kurs RMB jadi Rp ${next > 0 ? next.toLocaleString("id-ID") : "-"}?`}
        description={`Harga modal ${rmbProducts} barang yang punya harga RMB akan dihitung ulang. Harga jual dan nilai stok yang sudah tercatat tidak berubah.`}
        confirmText="Ya, ganti kurs"
      />
    </div>
  );
}
