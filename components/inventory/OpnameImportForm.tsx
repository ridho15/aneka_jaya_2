"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { locationLabel, type InvLocation } from "./labels";

type Side = { locationCode: string; items: number; nonZero: number; totalQty: number; documents: string[] };
type Summary = {
  dryRun: boolean; totalRows: number; newProducts: number; existingProducts: number; totalCostValue: number;
  warehouse?: Side; store?: Side; warnings: string[];
  sample: { sku: string; name: string; unit?: string; qtyWarehouse: number; qtyStore: number; costPrice?: number }[];
};

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export function OpnameImportForm({ locations }: { locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [warehouseId, setWarehouseId] = useState(locations.find((l) => l.type === "WAREHOUSE")?.id ?? "");
  const [storeId, setStoreId] = useState(locations.find((l) => l.type === "STORE")?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zeroUncounted, setZeroUncounted] = useState(true);
  const [updateMaster, setUpdateMaster] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(dryRun: boolean) {
    if (!file) return setError("Pilih file Excel (.xlsx) dulu.");
    if (!warehouseId && !storeId) return setError("Pilih lokasi gudang dan/atau toko.");
    if (!dryRun && !window.confirm("Posting opname? Stok sistem di lokasi terpilih akan DIGANTI dengan qty di file.")) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (warehouseId) form.set("warehouseLocationId", warehouseId);
      if (storeId) form.set("storeLocationId", storeId);
      form.set("opnameDate", date);
      form.set("dryRun", String(dryRun));
      form.set("zeroUncounted", String(zeroUncounted));
      form.set("updateMaster", String(updateMaster));
      const res = await fetch("/api/inventory/import-opname", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) { setError(json.message || "Import gagal."); return; }
      setSummary(json.data);
      if (!dryRun) { showToast("Opname dari Excel berhasil diposting.", "success"); router.refresh(); }
    } catch {
      setError("Koneksi gagal atau proses terlalu lama. Cek halaman Stock Opname sebelum mengulang — upload ulang file yang sama aman (tidak dobel).");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      <div className="aj-surface space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-semibold lg:col-span-2"><span>File Excel opname (.xlsx)</span>
            <input type="file" accept=".xlsx" className={input} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSummary(null); }} />
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>Tanggal opname</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div />
          <label className="space-y-1 text-sm font-semibold"><span>Kolom &quot;Qty Gudang&quot; masuk ke</span>
            <select className={input} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setSummary(null); }}>
              <option value="">— Jangan diimpor —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>Kolom &quot;Qty Toko&quot; masuk ke</span>
            <select className={input} value={storeId} onChange={(e) => { setStoreId(e.target.value); setSummary(null); }}>
              <option value="">— Jangan diimpor —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={zeroUncounted} onChange={(e) => { setZeroUncounted(e.target.checked); setSummary(null); }} /> Kode dengan qty 0 di file dianggap stoknya 0 (opname penuh)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={updateMaster} onChange={(e) => setUpdateMaster(e.target.checked)} /> Perbarui master barang (nama, kategori, satuan, modal &amp; harga jual bila terisi)</label>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => send(true)} disabled={busy}>{busy ? "Memproses..." : "1. Preview"}</Button>
          <Button onClick={() => send(false)} disabled={busy || !summary?.dryRun}>{busy ? "Memproses..." : "2. Posting Opname"}</Button>
        </div>
      </div>

      {summary && (
        <div className="aj-surface space-y-4 p-5 text-sm">
          <h3 className="font-bold text-slate-800">{summary.dryRun ? "Preview (belum disimpan)" : "Hasil posting"}</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Baris barang" value={fmt(summary.totalRows)} />
            <Stat label="Barang baru / sudah ada" value={`${fmt(summary.newProducts)} / ${fmt(summary.existingProducts)}`} />
            {summary.warehouse && <Stat label={`Qty gudang → ${summary.warehouse.locationCode}`} value={`${fmt(summary.warehouse.totalQty)} (${summary.warehouse.nonZero} kode)`} />}
            {summary.store && <Stat label={`Qty toko → ${summary.store.locationCode}`} value={`${fmt(summary.store.totalQty)} (${summary.store.nonZero} kode)`} />}
            <Stat label="Nilai modal fisik" value={`Rp ${fmt(summary.totalCostValue)}`} />
          </div>
          {!summary.dryRun && <p className="text-emerald-700">Dokumen opname: {[...(summary.warehouse?.documents ?? []), ...(summary.store?.documents ?? [])].join(", ")}</p>}
          {summary.warnings.length > 0 && (
            <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-amber-800">{summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          {summary.sample.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs text-slate-500">Contoh barang yang memiliki qty:</p>
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-2 py-1">Kode</th><th className="px-2 py-1">Nama</th><th className="px-2 py-1">Satuan</th><th className="px-2 py-1 text-right">Gudang</th><th className="px-2 py-1 text-right">Toko</th><th className="px-2 py-1 text-right">Modal</th></tr></thead>
                <tbody>{summary.sample.map((r) => (
                  <tr key={r.sku} className="border-t border-slate-100"><td className="px-2 py-1 font-mono">{r.sku}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.unit ?? "-"}</td><td className="px-2 py-1 text-right">{fmt(r.qtyWarehouse)}</td><td className="px-2 py-1 text-right">{fmt(r.qtyStore)}</td><td className="px-2 py-1 text-right">{fmt(r.costPrice ?? 0)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold text-slate-800">{value}</div></div>;
}
