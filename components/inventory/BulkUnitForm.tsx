"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

/** Betulkan satuan banyak barang sekaligus, mis. semua "PCS" menjadi "Lusin". */
export function BulkUnitForm({ units }: { units: { unit: string; count: number }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [fromUnit, setFromUnit] = useState(units.find((u) => u.unit.toUpperCase() === "PCS")?.unit ?? units[0]?.unit ?? "");
  const [toUnit, setToUnit] = useState("Lusin");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const count = units.find((u) => u.unit === fromUnit)?.count ?? 0;

  async function save() {
    if (!window.confirm(`Ubah satuan ${category ? `kategori "${category}" ` : ""}dari "${fromUnit}" menjadi "${toUnit}"? Hanya nama satuan yang berubah, qty stok tidak dikonversi.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/products/bulk-unit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromUnit, toUnit, category: category || undefined }) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal mengubah satuan.", "error");
      showToast(`${json.data.updated} barang diubah ke ${json.data.toUnit}.`, "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="aj-surface mb-6 p-5">
      <h3 className="font-bold text-slate-800">Ubah Satuan Massal</h3>
      <p className="mt-1 text-sm text-slate-600">Untuk membetulkan satuan yang sudah tersimpan, mis. semua barang &quot;PCS&quot; menjadi &quot;Lusin&quot;. Satuan per barang juga bisa diubah lewat tombol <b>Ubah</b> di tabel.</p>
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
        <Button onClick={save} disabled={busy || !fromUnit || !toUnit.trim()}>{busy ? "Menyimpan..." : `Ubah${category ? "" : ` ${count} barang`}`}</Button>
      </div>
    </div>
  );
}
