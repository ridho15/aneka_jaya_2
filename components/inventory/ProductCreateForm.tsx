"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { locationLabel, type InvLocation } from "./labels";

const empty = { sku: "", name: "", category: "", brand: "", unit: "PCS", barcode: "", minimumStock: "", unitsPerKoli: "", priceRmb: "", extraCostIdr: "", costPrice: "", sellingPrice: "", erpProductId: "", initialLocationId: "", initialQty: "" };

export function ProductCreateForm({ locations }: { locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      const n = (v: string) => (v ? Number(v) : undefined);
      const payload = {
        sku: form.sku, name: form.name, category: form.category, brand: form.brand, unit: form.unit || "PCS", barcode: form.barcode,
        minimumStock: n(form.minimumStock) ?? 0, costPrice: n(form.costPrice) ?? 0,
        unitsPerKoli: n(form.unitsPerKoli) ?? null, priceRmb: n(form.priceRmb) ?? null, extraCostIdr: n(form.extraCostIdr) ?? 0, sellingPrice: n(form.sellingPrice) ?? 0,
        erpProductId: n(form.erpProductId) ?? null,
        initialStock: form.initialLocationId && Number(form.initialQty) > 0 ? [{ locationId: form.initialLocationId, quantity: Number(form.initialQty), unitCost: n(form.costPrice) }] : undefined
      };
      const res = await fetch("/api/inventory/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan barang.", "error");
      showToast(`Barang ${json.data.sku} tersimpan.`, "success");
      setForm(empty); router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const field = (label: string, key: keyof typeof empty, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="space-y-1 text-sm font-semibold"><span>{label}</span><input className={input} value={form[key]} onChange={set(key)} {...extra} /></label>
  );
  return (
    <div className="aj-surface space-y-4 p-5">
      <h3 className="font-bold text-slate-800">Tambah Barang</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {field("SKU / Kode", "sku")}
        {field("Nama Barang", "name")}
        {field("Kategori", "category")}
        {field("Merk", "brand")}
        {field("Satuan", "unit")}
        {field("Barcode", "barcode")}
        {field("Isi per Koli (satuan)", "unitsPerKoli", { inputMode: "decimal", placeholder: "mis. 60" })}
        {field("Minimum Stok", "minimumStock", { inputMode: "decimal" })}
        {field("Harga RMB / satuan", "priceRmb", { inputMode: "decimal", placeholder: "opsional" })}
        {field("Biaya tambahan / satuan (Rp)", "extraCostIdr", { inputMode: "decimal", placeholder: "ongkir, CBM" })}
        {field("Modal (Rp) — otomatis bila ada harga RMB", "costPrice", { inputMode: "decimal" })}
        {field("Harga Jual", "sellingPrice", { inputMode: "decimal" })}
        {field("ID Produk ERP (pemetaan, opsional)", "erpProductId", { inputMode: "numeric" })}
        <label className="space-y-1 text-sm font-semibold"><span>Stok Awal di</span>
          <select className={input} value={form.initialLocationId} onChange={set("initialLocationId")}>
            <option value="">— Tanpa stok awal —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
          </select>
        </label>
        {field("Qty Stok Awal", "initialQty", { inputMode: "decimal", disabled: !form.initialLocationId })}
      </div>
      <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Barang"}</Button></div>
    </div>
  );
}
