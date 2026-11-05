"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

/** Betulkan satuan banyak barang sekaligus, mis. semua "PCS" menjadi "Lusin". */
export function BulkUnitForm({ units }: { units: { unit: string; count: number }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [fromUnit, setFromUnit] = useState(units.find((u) => u.unit.toUpperCase() === "PCS")?.unit ?? units[0]?.unit ?? "");
  const [toUnit, setToUnit] = useState("Lusin");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const count = units.find((u) => u.unit === fromUnit)?.count ?? 0;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/products/bulk-unit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromUnit, toUnit, category: category || undefined }) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal mengubah satuan.", "error");
      showToast(`${json.data.updated} barang diubah ke ${json.data.toUnit}.`, "success");
      setConfirmOpen(false);
      setTyped("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <details className="aj-surface mb-6 p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold text-slate-800">Alat massal: ubah satuan</summary>
      <p className="mt-2 text-sm text-slate-600">Membetulkan satuan banyak barang sekaligus, mis. semua &quot;PCS&quot; menjadi &quot;Lusin&quot;. Hanya nama satuan yang berubah; jumlah stok tidak dikonversi. Untuk satu barang, pakai tombol <b>Ubah</b> di tabel.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm font-semibold"><span>Dari satuan</span>
          <select className={`${input} block`} value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
            {units.map((u) => <option key={u.unit} value={u.unit}>{u.unit} ({u.count} barang)</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold"><span>Menjadi</span>
          <input className={`${input} block w-32`} value={toUnit} onChange={(e) => setToUnit(e.target.value)} list="unit-suggestions" />
          <datalist id="unit-suggestions"><option value="Lusin" /><option value="Pack" /><option value="Box" /><option value="Pak" /></datalist>
        </label>
        <label className="space-y-1 text-sm font-semibold"><span>Kategori (opsional)</span>
          <input className={`${input} block w-44`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="semua kategori" />
        </label>
        <Button variant="secondary" className="min-h-11" onClick={() => setConfirmOpen(true)} disabled={busy || !fromUnit || !toUnit.trim()}>Ubah satuan…</Button>
      </div>
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => { if (!busy) { setConfirmOpen(false); setTyped(""); } }}
        onConfirm={save}
        isLoading={busy}
        variant="danger"
        title={`Ubah satuan ${category ? `kategori "${category}" ` : `${count} barang `}dari ${fromUnit} ke ${toUnit}?`}
        description="Perubahan ini berlaku untuk semua barang yang cocok sekaligus dan tidak bisa dibatalkan otomatis."
        confirmText="Ubah satuan"
        confirmDisabled={typed.trim().toUpperCase() !== "UBAH"}
      >
        <label className="mt-3 block text-sm font-semibold text-slate-800">
          Ketik <b>UBAH</b> untuk lanjut
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      </ConfirmationModal>
    </details>
  );
}
