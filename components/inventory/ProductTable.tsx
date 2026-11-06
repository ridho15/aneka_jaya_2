"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { markupPercent } from "@/lib/inventory/shipmentCore";

export type ProductRow = {
  id: string; sku: string; name: string; category: string | null; brand: string | null; unit: string;
  unitsPerKoli: number | null; minimumStock: number; costPrice: number; priceRmb: number | null; extraCostIdr: number; sellingPrice: number;
  cbmPerUnit?: number | null; cbmRateIdr?: number | null; pcsPerUnit?: number | null;
  totalQuantity: number; totalKoliText: string; erpProductId: number | null;
};

const fmt = (n: number | null | undefined, d = 2) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: d }));

export function ProductTable({ rows, rate, cbmRate = null, canManage, initialEditingId }: { rows: ProductRow[]; rate: number | null; cbmRate?: number | null; canManage: boolean; initialEditingId?: string }) {
  const [editing, setEditing] = useState<string | null>(canManage && initialEditingId ? initialEditingId : null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editingRow = rows.find((x) => x.id === editing);
  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);
  return (
    <>
      {/* Form edit di luar tabel supaya tetap utuh di layar HP (tabel bisa digeser ke samping). */}
      {editingRow && (
        <div ref={editorRef} className="aj-surface mb-4 scroll-mt-4 border-emerald-300 p-4">
          <h3 className="mb-3 font-bold text-slate-900">Ubah {editingRow.sku}</h3>
          <ProductEditor key={editingRow.id} row={editingRow} rate={rate} cbmRate={cbmRate} onDone={() => setEditing(null)} />
        </div>
      )}
    <div className="aj-surface mb-8 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Kode</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Satuan</th><th className="px-3 py-2 text-right">Isi per koli</th>
            <th className="px-3 py-2 text-right">Harga RMB</th><th className="px-3 py-2 text-right">Modal</th><th className="px-3 py-2 text-right">Harga Jual</th><th className="px-3 py-2 text-right">Mark-up</th>
            <th className="px-3 py-2 text-right">Total Stok</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
              <tr key={x.id} className={`border-t border-slate-100 ${editing === x.id ? "bg-emerald-50" : ""}`}>
                <td className="px-3 py-2 font-mono text-xs font-semibold">{x.sku}</td>
                <td className="px-3 py-2"><Link className="hover:text-emerald-800" href={`/inventory/mutasi?productId=${x.id}`}>{x.name}</Link><div className="text-xs text-slate-600">{[x.category, x.brand].filter(Boolean).join(" / ")}</div></td>
                <td className="px-3 py-2">{x.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.unitsPerKoli ? `${fmt(x.unitsPerKoli)} ${x.unit}` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.priceRmb != null ? `¥ ${fmt(x.priceRmb, 4)}` : "-"}{x.priceRmb != null && x.cbmPerUnit ? <div className="text-xs text-slate-600">{fmt(x.cbmPerUnit, 6)} CBM</div> : null}{x.priceRmb != null && x.extraCostIdr ? <div className="text-xs text-slate-600">+ Rp {fmt(x.extraCostIdr)}</div> : null}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(x.costPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(x.sellingPrice)}</td>
                <MarkupCell cost={x.costPrice} sell={x.sellingPrice} />
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${x.minimumStock > 0 && x.totalQuantity <= x.minimumStock ? "text-red-800" : ""}`}>
                  {x.totalKoliText}{x.unitsPerKoli && x.totalQuantity ? <div className="text-xs font-normal text-slate-600">{fmt(x.totalQuantity)} {x.unit}</div> : null}
                </td>
                <td className="px-3 py-2 text-right">{canManage && <button className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" onClick={() => setEditing(editing === x.id ? null : x.id)}>{editing === x.id ? "Tutup" : "Ubah"}</button>}</td>
              </tr>
          ))}
          {!rows.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-600">Belum ada barang.</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}

function MarkupCell({ cost, sell }: { cost: number; sell: number }) {
  const m = markupPercent(cost, sell);
  return <td className={`px-3 py-2 text-right tabular-nums ${m == null ? "text-slate-400" : m < 0 ? "font-semibold text-rose-700" : ""}`}>{m == null ? "-" : `${fmt(m, 1)}%`}</td>;
}

function ProductEditor({ row, rate, cbmRate, onDone }: { row: ProductRow; rate: number | null; cbmRate: number | null; onDone: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState({ name: row.name, unit: row.unit, unitsPerKoli: s(row.unitsPerKoli), priceRmb: s(row.priceRmb), extraCostIdr: s(row.extraCostIdr || null), costPrice: s(row.costPrice), sellingPrice: s(row.sellingPrice), minimumStock: s(row.minimumStock), cbmPerUnit: s(row.cbmPerUnit), cbmRateIdr: s(row.cbmRateIdr) });
  const [busy, setBusy] = useState(false);
  const rmb = f.priceRmb.trim() === "" ? null : Number(f.priceRmb);
  const cbm = Number(f.cbmPerUnit) || 0;
  const cbmTariff = f.cbmRateIdr.trim() === "" ? cbmRate ?? 0 : Number(f.cbmRateIdr) || 0;
  const freight = Math.round(cbm * cbmTariff * 100) / 100;
  const previewCost = rmb != null && rate ? Math.round((rmb * rate + freight + (Number(f.extraCostIdr) || 0)) * 100) / 100 : null;
  const markup = markupPercent(previewCost ?? (Number(f.costPrice) || 0), Number(f.sellingPrice) || 0);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: f.name, unit: f.unit,
        unitsPerKoli: f.unitsPerKoli.trim() === "" ? null : Number(f.unitsPerKoli),
        priceRmb: rmb,
        extraCostIdr: Number(f.extraCostIdr) || 0,
        cbmPerUnit: f.cbmPerUnit.trim() === "" ? null : Number(f.cbmPerUnit),
        cbmRateIdr: f.cbmRateIdr.trim() === "" ? null : Number(f.cbmRateIdr),
        costPrice: Number(f.costPrice) || 0,
        sellingPrice: Number(f.sellingPrice) || 0,
        minimumStock: Number(f.minimumStock) || 0
      };
      const res = await fetch(`/api/inventory/products/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan.", "error");
      showToast(`Barang ${row.sku} diperbarui.`, "success");
      onDone(); router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-700";
  const field = (label: string, key: keyof typeof f, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="space-y-1 text-xs font-semibold text-slate-700"><span>{label}</span><input className={input} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...extra} /></label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="sm:col-span-2">{field("Nama", "name")}</div>
        {field("Satuan", "unit")}
        {field(`Isi per koli (${f.unit || "Lusin"})`, "unitsPerKoli", { inputMode: "decimal", placeholder: "mis. 60" })}
        {field(`Harga RMB per ${f.unit || "Lusin"}`, "priceRmb", { inputMode: "decimal", placeholder: "kosong = tanpa RMB" })}
        {field(`CBM per ${f.unit || "Lusin"}`, "cbmPerUnit", { inputMode: "decimal", placeholder: "mis. 0.0021" })}
        {field("Tarif CBM khusus (Rp)", "cbmRateIdr", { inputMode: "decimal", placeholder: cbmRate ? `global ${cbmRate.toLocaleString("id-ID")}` : "pakai tarif global" })}
        {field(`Biaya lain per ${f.unit || "Lusin"} (Rp)`, "extraCostIdr", { inputMode: "decimal", placeholder: "0" })}
        {field(`Modal per ${f.unit || "Lusin"} (Rp)`, "costPrice", { inputMode: "decimal", disabled: previewCost != null })}
        {field(`Harga Jual per ${f.unit || "Lusin"} (Rp)`, "sellingPrice", { inputMode: "decimal" })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{previewCost != null ? <>Modal otomatis: ¥{rmb} × Rp {rate?.toLocaleString("id-ID")}{freight ? ` + ongkir CBM Rp ${freight.toLocaleString("id-ID")}` : ""}{Number(f.extraCostIdr) ? ` + Rp ${Number(f.extraCostIdr).toLocaleString("id-ID")}` : ""} = <b>Rp {previewCost.toLocaleString("id-ID")}</b>{markup != null ? <> · mark-up <b>{markup.toLocaleString("id-ID")}%</b></> : null}</> : rmb != null ? "Kurs RMB belum diatur, jadi modal belum dihitung otomatis." : "Isi Harga RMB agar modal ikut berubah saat kurs RMB diganti."}</span>
        <div className="flex gap-2"><Button variant="secondary" className="min-h-11" onClick={onDone}>Batal</Button><Button className="min-h-11" onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button></div>
      </div>
    </div>
  );
}
