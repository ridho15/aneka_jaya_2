"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export type ProductRow = {
  id: string; sku: string; name: string; category: string | null; brand: string | null; unit: string;
  unitsPerKoli: number | null; minimumStock: number; costPrice: number; priceRmb: number | null; extraCostIdr: number; sellingPrice: number;
  totalQuantity: number; totalKoliText: string; erpProductId: number | null;
};

const fmt = (n: number | null | undefined, d = 2) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: d }));

export function ProductTable({ rows, rate, canManage, initialEditingId }: { rows: ProductRow[]; rate: number | null; canManage: boolean; initialEditingId?: string }) {
  const [editing, setEditing] = useState<string | null>(canManage && initialEditingId ? initialEditingId : null);
  return (
    <div className="aj-surface mb-8 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Satuan</th><th className="px-3 py-2 text-right">Isi / Koli</th>
            <th className="px-3 py-2 text-right">Harga RMB / satuan</th><th className="px-3 py-2 text-right">Modal / satuan</th><th className="px-3 py-2 text-right">Harga Jual / satuan</th>
            <th className="px-3 py-2 text-right">Total Stok</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <Fragment key={x.id}>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{x.sku}</td>
                <td className="px-3 py-2"><Link className="hover:text-emerald-700" href={`/inventory/mutasi?productId=${x.id}`}>{x.name}</Link><div className="text-xs text-slate-500">{[x.category, x.brand].filter(Boolean).join(" / ")}</div></td>
                <td className="px-3 py-2">{x.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.unitsPerKoli ? `${fmt(x.unitsPerKoli)} ${x.unit}` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.priceRmb != null ? `¥ ${fmt(x.priceRmb, 4)}` : "-"}{x.priceRmb != null && x.extraCostIdr ? <div className="text-xs text-slate-500">+ Rp {fmt(x.extraCostIdr)}</div> : null}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(x.costPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(x.sellingPrice)}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${x.minimumStock > 0 && x.totalQuantity <= x.minimumStock ? "text-red-600" : ""}`}>
                  {x.totalKoliText}{x.unitsPerKoli && x.totalQuantity ? <div className="text-xs font-normal text-slate-500">{fmt(x.totalQuantity)} {x.unit}</div> : null}
                </td>
                <td className="px-3 py-2 text-right">{canManage && <button className="text-xs font-semibold text-emerald-700" onClick={() => setEditing(editing === x.id ? null : x.id)}>{editing === x.id ? "Tutup" : "Ubah"}</button>}</td>
              </tr>
              {editing === x.id && <tr className="bg-emerald-50/40"><td colSpan={9} className="px-3 py-3"><ProductEditor row={x} rate={rate} onDone={() => setEditing(null)} /></td></tr>}
            </Fragment>
          ))}
          {!rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Belum ada barang.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProductEditor({ row, rate, onDone }: { row: ProductRow; rate: number | null; onDone: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState({ name: row.name, unit: row.unit, unitsPerKoli: s(row.unitsPerKoli), priceRmb: s(row.priceRmb), extraCostIdr: s(row.extraCostIdr || null), costPrice: s(row.costPrice), sellingPrice: s(row.sellingPrice), minimumStock: s(row.minimumStock) });
  const [busy, setBusy] = useState(false);
  const rmb = f.priceRmb.trim() === "" ? null : Number(f.priceRmb);
  const previewCost = rmb != null && rate ? Math.round((rmb * rate + (Number(f.extraCostIdr) || 0)) * 100) / 100 : null;

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: f.name, unit: f.unit,
        unitsPerKoli: f.unitsPerKoli.trim() === "" ? null : Number(f.unitsPerKoli),
        priceRmb: rmb,
        extraCostIdr: Number(f.extraCostIdr) || 0,
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

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const field = (label: string, key: keyof typeof f, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="space-y-1 text-xs font-semibold text-slate-700"><span>{label}</span><input className={input} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...extra} /></label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="sm:col-span-2">{field("Nama", "name")}</div>
        {field("Satuan", "unit")}
        {field(`Isi per koli (${f.unit || "satuan"})`, "unitsPerKoli", { inputMode: "decimal", placeholder: "mis. 60" })}
        {field(`Harga RMB per ${f.unit || "lusin"}`, "priceRmb", { inputMode: "decimal", placeholder: "kosong = tanpa RMB" })}
        {field(`Biaya tambahan per ${f.unit || "lusin"} (Rp)`, "extraCostIdr", { inputMode: "decimal", placeholder: "ongkir, CBM" })}
        {field(`Modal per ${f.unit || "lusin"} (Rp)`, "costPrice", { inputMode: "decimal", disabled: previewCost != null })}
        {field(`Harga Jual per ${f.unit || "lusin"} (Rp)`, "sellingPrice", { inputMode: "decimal" })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{previewCost != null ? <>Modal otomatis: ¥{rmb} × Rp {rate?.toLocaleString("id-ID")}{Number(f.extraCostIdr) ? ` + Rp ${Number(f.extraCostIdr).toLocaleString("id-ID")}` : ""} = <b>Rp {previewCost.toLocaleString("id-ID")}</b></> : rmb != null ? "Kurs RMB belum diatur — modal tidak dihitung otomatis." : "Isi Harga RMB agar modal ikut berubah saat kurs RMB diganti."}</span>
        <div className="flex gap-2"><Button variant="secondary" onClick={onDone}>Batal</Button><Button onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button></div>
      </div>
    </div>
  );
}
