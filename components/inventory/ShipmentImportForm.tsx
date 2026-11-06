"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import { computeShipment, markupPercent, shipmentUnitCost, type MasterHint, type ShipmentLine, type ShipmentOverride } from "@/lib/inventory/shipmentCore";
import { locationLabel, type InvLocation } from "./labels";

type Preview = {
  title: string;
  reference: string;
  lines: ShipmentLine[];
  master: Record<string, MasterHint>;
  translatedNames: Record<string, string>;
  rmbRate: number | null;
  cbmRate: number | null;
};

type SaveResult = { products: number; created: number; updated: number; stockIn: { referenceNumber: string; items: number } | null };

const rp = (n: number | null | undefined) => (n == null ? "-" : `Rp ${Math.round(n).toLocaleString("id-ID")}`);
const num = (n: number | null | undefined, d = 2) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: d }));

const SOURCE_LABEL: Record<string, string> = {
  master: "dari Master",
  "file-dz": "DZ di file",
  "rumus-12": "÷12",
  "rumus-10": "÷10",
  manual: "diubah",
  tebakan: "cek"
};

export function ShipmentImportForm({ locations }: { locations: InvLocation[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ShipmentOverride>>({});
  const [addStock, setAddStock] = useState(true);
  const [locationId, setLocationId] = useState(locations.find((l) => l.type === "WAREHOUSE")?.id ?? locations[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const products = useMemo(
    () => (preview ? computeShipment(preview.lines, { master: preview.master, overrides, translatedNames: preview.translatedNames }) : []),
    [preview, overrides]
  );
  const rows = products.map((p) => {
    const cost = shipmentUnitCost(p, preview?.rmbRate ?? null, preview?.cbmRate ?? null);
    const sell = preview?.master[p.sku.toLowerCase()]?.sellingPrice ?? 0;
    return { p, cost, sell, markup: markupPercent(cost, sell) };
  });
  const totals = rows.reduce(
    (s, r) => ({ value: s.value + (r.cost ?? 0) * r.p.quantity, created: s.created + (r.p.exists ? 0 : 1), warnings: s.warnings + (r.p.warnings.length ? 1 : 0) }),
    { value: 0, created: 0, warnings: 0 }
  );

  async function upload(next: File | null) {
    setFile(next);
    setPreview(null);
    setOverrides({});
    setResult(null);
    setError(null);
    if (!next) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", next);
      form.set("mode", "preview");
      const res = await fetch("/api/inventory/import-shipment", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) return setError(json.message || "File tidak bisa dibaca.");
      setPreview(json.data);
    } catch {
      setError("Koneksi terputus saat membaca file. Coba unggah lagi.");
    } finally {
      setBusy(false);
    }
  }

  function setOverride(sku: string, patch: ShipmentOverride) {
    setOverrides((prev) => ({ ...prev, [sku]: { ...prev[sku], ...patch } }));
  }

  async function save() {
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", "save");
      // Nama hasil terjemahan ikut dikirim supaya yang tersimpan sama dengan yang terlihat.
      const sent: Record<string, ShipmentOverride> = {};
      for (const { p } of rows) sent[p.sku] = { ...overrides[p.sku], name: p.name };
      form.set("overrides", JSON.stringify(sent));
      form.set("addStock", String(addStock));
      if (addStock) form.set("locationId", locationId);
      form.set("movementDate", date);
      const res = await fetch("/api/inventory/import-shipment", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) return setError(json.message || "Gagal menyimpan.");
      setResult(json.data);
      showToast("Packing list tersimpan ke Master Barang.", "success");
      router.refresh();
    } catch {
      setError("Koneksi terputus. Cek Master Barang dulu; mengunggah ulang file yang sama tidak membuat stok dobel.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const missingRate = preview && (!preview.rmbRate || !preview.cbmRate);

  return (
    <div className="space-y-4">
      <div className="aj-surface grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">
          <span>File packing list (.xlsx)</span>
          <input type="file" accept=".xlsx" className={input} onChange={(e) => void upload(e.target.files?.[0] ?? null)} disabled={busy} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Tanggal barang masuk</span>
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="space-y-1 text-sm font-semibold">
          <label className="flex min-h-6 items-center gap-2">
            <input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} />
            <span>Tambah stok ke</span>
          </label>
          <select className={input} value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!addStock}>
            {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
          </select>
        </div>
      </div>

      {busy && !preview && <p className="text-sm text-slate-600">Membaca file…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {preview && (
        <div className="aj-surface overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 text-sm">
            <p>
              <b>{preview.reference}</b> · {products.length} barang ({totals.created} baru) · nilai modal {rp(totals.value)}
              {totals.warnings > 0 && <span className="text-amber-700"> · {totals.warnings} perlu dicek</span>}
            </p>
            <p className="text-xs text-slate-600">
              Kurs {preview.rmbRate ? `Rp ${num(preview.rmbRate)}/RMB` : "belum diatur"} · Tarif CBM {preview.cbmRate ? rp(preview.cbmRate) : "belum diatur"}
            </p>
          </div>
          {missingRate && (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Atur kurs RMB dan tarif CBM di Master Barang dulu supaya modal terhitung. Tanpa itu barang tetap tersimpan, modal diisi belakangan.
            </p>
          )}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Barang</th>
                  <th className="px-2 py-2 text-right">Isi pcs</th>
                  <th className="px-2 py-2 text-right">Stok</th>
                  <th className="hidden px-2 py-2 text-right md:table-cell">RMB/satuan</th>
                  <th className="hidden px-2 py-2 text-right md:table-cell">CBM/satuan</th>
                  <th className="px-2 py-2 text-right">Modal</th>
                  <th className="hidden px-2 py-2 text-right sm:table-cell">Jual</th>
                  <th className="px-3 py-2 text-right">Mark-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ p, cost, sell, markup }) => (
                  <tr key={p.sku} className={p.warnings.length ? "bg-amber-50/50" : undefined}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">{p.sku}</span>
                        {!p.exists && <span className="rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-800">baru</span>}
                        <input
                          aria-label={`Nama ${p.sku}`}
                          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:outline-none"
                          value={p.name}
                          onChange={(e) => setOverride(p.sku, { name: e.target.value })}
                        />
                      </div>
                      {p.warnings.length > 0 && <p className="truncate pl-1 text-[11px] text-amber-800" title={p.warnings.join(" ")}>{p.warnings.join(" ")}</p>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        aria-label={`Isi pcs per satuan ${p.sku}`}
                        inputMode="numeric"
                        className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right"
                        value={p.pcsPerUnit}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (v > 0) setOverride(p.sku, { pcsPerUnit: v });
                        }}
                      />
                      <span className="block text-[10px] text-slate-500">{SOURCE_LABEL[p.pcsPerUnitSource]}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{num(p.quantity)} {p.unit}<span className="block text-[10px] text-slate-500">{p.cartons} koli</span></td>
                    <td className="hidden px-2 py-1.5 text-right md:table-cell">{num(p.priceRmb, 4)}</td>
                    <td className="hidden px-2 py-1.5 text-right md:table-cell">{num(p.cbmPerUnit, 6)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{rp(cost)}</td>
                    <td className="hidden whitespace-nowrap px-2 py-1.5 text-right sm:table-cell">{sell ? rp(sell) : "-"}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${markup == null ? "text-slate-400" : markup < 0 ? "text-rose-700" : "text-slate-800"}`}>
                      {markup == null ? "-" : `${num(markup, 1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-600">
              Barang lama: nama dan kategori tidak ditimpa, isi per koli hanya diisi bila kosong. Harga jual barang baru diisi di Master Barang.
            </p>
            <Button className="min-h-11" disabled={busy || (addStock && !locationId)} onClick={() => setConfirmOpen(true)}>
              {busy ? "Menyimpan…" : addStock ? "Simpan & tambah stok" : "Simpan ke Master Barang"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {result.created} barang baru, {result.updated} diperbarui.
          {result.stockIn ? ` Barang masuk ${result.stockIn.referenceNumber}: ${result.stockIn.items} barang.` : ""}
        </p>
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={save}
        isLoading={busy}
        variant="warning"
        title={`Simpan ${products.length} barang dari ${preview?.reference ?? "file"}?`}
        description={addStock
          ? `Master Barang diperbarui dan stok ditambahkan ke ${locationLabel(locations.find((l) => l.id === locationId) ?? locations[0])}. File yang sama tidak bisa menambah stok dua kali.`
          : "Master Barang diperbarui (modal, isi pcs, CBM). Stok tidak berubah."}
        confirmText="Ya, simpan"
      />
    </div>
  );
}
