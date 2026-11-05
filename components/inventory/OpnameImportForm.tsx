"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
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
  // Lokasi sengaja tidak dipilih otomatis: opname mengganti stok, jadi pengguna harus memilih sendiri.
  const [warehouseId, setWarehouseId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zeroUncounted, setZeroUncounted] = useState(true);
  const [updateMaster, setUpdateMaster] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  type Choice = { file: File | null; warehouseId: string; storeId: string; zeroUncounted: boolean };

  // Cek otomatis begitu file dan minimal satu lokasi sudah dipilih, jadi tidak perlu klik "Cek".
  function changed(next: Partial<Choice>) {
    const choice = { file, warehouseId, storeId, zeroUncounted, ...next };
    if (next.file !== undefined) setFile(next.file);
    if (next.warehouseId !== undefined) setWarehouseId(next.warehouseId);
    if (next.storeId !== undefined) setStoreId(next.storeId);
    if (next.zeroUncounted !== undefined) setZeroUncounted(next.zeroUncounted);
    setSummary(null);
    setError(null);
    if (choice.file && (choice.warehouseId || choice.storeId)) void send(true, choice);
  }

  async function send(dryRun: boolean, choice?: Choice) {
    const c = choice ?? { file, warehouseId, storeId, zeroUncounted };
    if (!c.file) return setError("Pilih file Excel (.xlsx) dulu.");
    if (!c.warehouseId && !c.storeId) return setError("Pilih lokasi untuk kolom Qty Gudang dan/atau Qty Toko.");
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("file", c.file);
      if (c.warehouseId) form.set("warehouseLocationId", c.warehouseId);
      if (c.storeId) form.set("storeLocationId", c.storeId);
      form.set("opnameDate", date);
      form.set("dryRun", String(dryRun));
      form.set("zeroUncounted", String(c.zeroUncounted));
      form.set("updateMaster", String(updateMaster));
      const res = await fetch("/api/inventory/import-opname", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) { setError(json.message || "Import gagal."); return; }
      setSummary(json.data);
      if (!dryRun) { showToast("Opname dari Excel berhasil disimpan.", "success"); router.refresh(); }
    } catch {
      setError("Koneksi terputus atau proses terlalu lama. Cek dulu halaman Stock Opname. Kalau belum masuk, unggah ulang file yang sama; stok tidak akan dobel.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const pick = (id: string) => locations.find((l) => l.id === id);
  return (
    <div className="space-y-6">
      <div className="aj-surface space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-semibold lg:col-span-2"><span>File Excel opname (.xlsx)</span>
            <input type="file" accept=".xlsx" className={input} onChange={(e) => changed({ file: e.target.files?.[0] ?? null })} />
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>Tanggal opname</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div />
          <label className="space-y-1 text-sm font-semibold"><span>Kolom &quot;Qty Gudang&quot; masuk ke</span>
            <select className={input} value={warehouseId} onChange={(e) => changed({ warehouseId: e.target.value })}>
              <option value="">Tidak diimpor</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>Kolom &quot;Qty Toko&quot; masuk ke</span>
            <select className={input} value={storeId} onChange={(e) => changed({ storeId: e.target.value })}>
              <option value="">Tidak diimpor</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={zeroUncounted} onChange={(e) => changed({ zeroUncounted: e.target.checked })} /> Barang dengan jumlah 0 di file dianggap habis (opname penuh). Matikan kalau file hanya berisi sebagian barang.</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={updateMaster} onChange={(e) => setUpdateMaster(e.target.checked)} /> Perbarui Master Barang (nama, kategori, satuan, modal, harga jual) bila kolomnya terisi</label>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!summary?.dryRun && <span className="text-sm text-slate-600">{busy ? "Mengecek file…" : "Pilih file dan lokasi; hasil cek muncul otomatis."}</span>}
          <Button className="min-h-11" onClick={() => setConfirmOpen(true)} disabled={busy || !summary?.dryRun}>{busy ? "Memproses..." : "Simpan Opname"}</Button>
        </div>
        <ConfirmationModal
          isOpen={confirmOpen}
          onClose={() => !busy && setConfirmOpen(false)}
          onConfirm={() => send(false)}
          isLoading={busy}
          variant="warning"
          title="Simpan opname dari Excel?"
          description={`Stok di ${[pick(warehouseId)?.name, pick(storeId)?.name].filter(Boolean).join(" dan ")} akan diganti dengan jumlah di file.${zeroUncounted ? " Barang yang jumlahnya 0 di file akan dianggap habis." : ""}`}
          confirmText="Ya, simpan opname"
        />
      </div>

      {summary && (
        <div className="aj-surface space-y-4 p-5 text-sm">
          <h3 className="font-bold text-slate-800">{summary.dryRun ? "Hasil cek (belum disimpan)" : "Opname tersimpan"}</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Baris barang" value={fmt(summary.totalRows)} />
            <Stat label="Barang baru / sudah ada" value={`${fmt(summary.newProducts)} / ${fmt(summary.existingProducts)}`} />
            {summary.warehouse && <Stat label={`Qty gudang → ${summary.warehouse.locationCode}`} value={`${fmt(summary.warehouse.totalQty)} (${summary.warehouse.nonZero} kode)`} />}
            {summary.store && <Stat label={`Qty toko → ${summary.store.locationCode}`} value={`${fmt(summary.store.totalQty)} (${summary.store.nonZero} kode)`} />}
            <Stat label="Nilai modal fisik" value={`Rp ${fmt(summary.totalCostValue)}`} />
          </div>
          {!summary.dryRun && <p className="text-emerald-800">Dokumen opname: {[...(summary.warehouse?.documents ?? []), ...(summary.store?.documents ?? [])].join(", ")}</p>}
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
