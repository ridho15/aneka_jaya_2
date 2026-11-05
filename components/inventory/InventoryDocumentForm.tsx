"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/ToastProvider";
import { koliText, koliToQty, locationLabel, type InvLocation, type InvProduct } from "./labels";

type Mode = "transfer" | "opname" | "adjustment" | "stock-in";
type Row = { productId: string; qty: string; koli: string; loose: string; unitCost: string; notes: string };

const ENDPOINT: Record<Mode, string> = {
  transfer: "/api/inventory/transfers",
  opname: "/api/inventory/opnames",
  adjustment: "/api/inventory/adjustments",
  "stock-in": "/api/inventory/stock-in"
};

const QTY_LABEL: Record<Mode, string> = {
  transfer: "Qty Transfer (koli + lepas)",
  opname: "Qty Fisik (koli + lepas)",
  adjustment: "Qty (+ tambah / − kurang)",
  "stock-in": "Qty Masuk (koli + lepas)"
};

export function InventoryDocumentForm({ mode, locations, products }: { mode: Mode; locations: InvLocation[]; products: InvProduct[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [locationId, setLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [stockSnapshot, setStockSnapshot] = useState<{ locationId: string; qty: Record<string, number> }>({ locationId: "", qty: {} });
  const systemQty = useMemo(() => (locationId && stockSnapshot.locationId === locationId ? stockSnapshot.qty : {}), [locationId, stockSnapshot]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(
    () => products.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => ({ value: p.id, label: p.name, badge: p.sku, description: `${p.unit}${p.unitsPerKoli ? ` • isi ${p.unitsPerKoli}/koli` : ""}${locationId ? ` • stok: ${koliText(systemQty[p.id] ?? 0, p.unitsPerKoli, p.unit)}` : ""}` })),
    [products, rows, systemQty, locationId]
  );

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    fetch(`/api/inventory/stocks?locationId=${encodeURIComponent(locationId)}&includeZero=1&pageSize=5000`)
      .then((r) => r.json())
      .then((json) => {
        if (!active || !json.success) return;
        setStockSnapshot({ locationId, qty: Object.fromEntries((json.data as { productId: string; quantity: number }[]).map((b) => [b.productId, b.quantity])) });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [locationId]);

  /** Qty satuan dari baris: koli × isi + lepas bila barang punya isi/koli, selain itu qty langsung. */
  const rowQty = (row: Row) => {
    const perKoli = productMap.get(row.productId)?.unitsPerKoli;
    if (perKoli) return row.koli.trim() === "" && row.loose.trim() === "" ? NaN : koliToQty(row.koli, row.loose, perKoli);
    return row.qty.trim() === "" ? NaN : Number(row.qty);
  };

  const updateRow = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function submit() {
    setError(null);
    if (!locationId) return setError(mode === "transfer" ? "Pilih lokasi asal." : "Pilih lokasi gudang/toko.");
    if (mode === "transfer" && !toLocationId) return setError("Pilih lokasi tujuan.");
    if (mode === "adjustment" && reason.trim().length < 3) return setError("Alasan adjustment wajib diisi.");
    if (!rows.length) return setError("Tambahkan minimal satu barang.");
    const bad = rows.find((r) => !Number.isFinite(rowQty(r)));
    if (bad) return setError(`Qty ${productMap.get(bad.productId)?.sku ?? ""} wajib diisi angka (koli/lepas atau qty).`);

    const items = rows.map((r) => {
      const base = { productId: r.productId, notes: r.notes || undefined };
      const perKoli = productMap.get(r.productId)?.unitsPerKoli;
      const qtyPart = perKoli
        ? { koli: r.koli.trim() === "" ? undefined : Number(r.koli), loose: r.loose.trim() === "" ? undefined : Number(r.loose) }
        : mode === "opname" ? { countedQty: Number(r.qty) } : { quantity: Number(r.qty) };
      if (mode === "opname") return { ...base, ...qtyPart };
      return { ...base, ...qtyPart, unitCost: r.unitCost ? Number(r.unitCost) : undefined };
    });
    const body: Record<string, unknown> = { notes: notes || undefined, items, idempotencyKey: crypto.randomUUID() };
    if (mode === "transfer") Object.assign(body, { fromLocationId: locationId, toLocationId, transferDate: date, receiveNow });
    if (mode === "opname") Object.assign(body, { locationId, opnameDate: date });
    if (mode === "adjustment") Object.assign(body, { locationId, adjustmentDate: date, reason });
    if (mode === "stock-in") Object.assign(body, { locationId, movementDate: date, referenceNumber: reference || undefined });

    setSubmitting(true);
    try {
      const response = await fetch(ENDPOINT[mode], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!json.success) {
        setError(json.message || "Gagal menyimpan.");
        return;
      }
      showToast("Dokumen stok berhasil disimpan.", "success");
      setRows([]); setNotes(""); setReason(""); setReference("");
      router.refresh();
    } catch {
      setError("Koneksi gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

  return (
    <div className="aj-surface space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          <span>{mode === "transfer" ? "Dari (asal)" : "Gudang / Toko"}</span>
          <select className={input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— Pilih —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
          </select>
        </label>
        {mode === "transfer" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            <span>Ke (tujuan)</span>
            <select className={input} value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">— Pilih —</option>
              {locations.filter((l) => l.id !== locationId).map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          <span>Tanggal</span>
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {mode === "adjustment" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
            <span>Alasan</span>
            <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. barang rusak, hilang, bonus supplier" />
          </label>
        )}
        {mode === "stock-in" && (
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            <span>No. Referensi (opsional)</span>
            <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="No. faktur / surat jalan" />
          </label>
        )}
        {mode === "transfer" && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} />
            Langsung diterima di tujuan
          </label>
        )}
      </div>

      {mode === "opname" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Stock opname <b>mengganti</b> stok sistem dengan qty fisik yang diinput. Selisih otomatis dicatat di kartu stok.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Barang</th>
              <th className="px-3 py-2 text-right">Stok Sistem</th>
              <th className="px-3 py-2">{QTY_LABEL[mode]}</th>
              {mode === "opname" && <th className="px-3 py-2 text-right">Selisih</th>}
              {(mode === "stock-in" || mode === "adjustment") && <th className="px-3 py-2">HPP / unit</th>}
              <th className="px-3 py-2">Catatan</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const p = productMap.get(row.productId);
              const sys = systemQty[row.productId] ?? 0;
              const q = rowQty(row);
              const diff = Number.isFinite(q) ? Math.round((q - sys) * 100) / 100 : null;
              const unit = p?.unit ?? "";
              return (
                <tr key={row.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2"><div className="font-semibold text-slate-800">{p?.name}</div><div className="text-xs text-slate-500">{p?.sku} • {unit}{p?.unitsPerKoli ? ` • isi ${p.unitsPerKoli} ${unit}/koli` : ""}</div></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{locationId ? <>{koliText(sys, p?.unitsPerKoli, unit)}{p?.unitsPerKoli ? <div className="text-xs text-slate-400">{sys} {unit}</div> : null}</> : "-"}</td>
                  <td className="px-3 py-2">
                    {p?.unitsPerKoli ? (
                      <div className="flex items-center gap-1">
                        <input className={`${input.replace("w-full", "")} w-20`} inputMode="decimal" placeholder="koli" aria-label="Koli" value={row.koli} onChange={(e) => updateRow(i, { koli: e.target.value })} />
                        <span className="whitespace-nowrap text-xs text-slate-500">koli +</span>
                        <input className={`${input.replace("w-full", "")} w-20`} inputMode="decimal" placeholder="lepas" aria-label={`Lepas (${unit})`} value={row.loose} onChange={(e) => updateRow(i, { loose: e.target.value })} />
                        <span className="text-xs text-slate-500">{unit}</span>
                      </div>
                    ) : (
                      <input className={`${input} w-28`} inputMode="decimal" value={row.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} />
                    )}
                    {p?.unitsPerKoli && Number.isFinite(q) ? <div className="mt-1 text-xs text-slate-500">= {q.toLocaleString("id-ID")} {unit}</div> : null}
                  </td>
                  {mode === "opname" && <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${diff && diff < 0 ? "text-red-600" : diff ? "text-emerald-700" : ""}`}>{diff == null ? "-" : `${diff > 0 ? "+" : ""}${diff} ${unit}`}</td>}
                  {(mode === "stock-in" || mode === "adjustment") && <td className="px-3 py-2"><input className={`${input} w-32`} inputMode="decimal" value={row.unitCost} onChange={(e) => updateRow(i, { unitCost: e.target.value })} placeholder="opsional" /></td>}
                  <td className="px-3 py-2"><input className={input} value={row.notes} onChange={(e) => updateRow(i, { notes: e.target.value })} /></td>
                  <td className="px-3 py-2"><button type="button" className="text-xs font-semibold text-red-600" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>Hapus</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-96">
          <SearchableSelect
            options={productOptions}
            onSelect={(productId) => setRows((prev) => [...prev, { productId, qty: "", koli: "", loose: "", unitCost: "", notes: "" }])}
            placeholder="+ Tambah barang"
            searchPlaceholder="Cari SKU / nama barang..."
            emptyText="Barang tidak ditemukan. Tambahkan di Master Barang."
          />
        </div>
      </div>

      <label className="block space-y-1 text-sm font-semibold text-slate-700">
        <span>Catatan</span>
        <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={submitting}>{submitting ? "Menyimpan..." : "Simpan & Posting"}</Button>
      </div>
    </div>
  );
}
