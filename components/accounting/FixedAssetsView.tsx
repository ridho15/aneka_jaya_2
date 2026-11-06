"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export type FixedAssetItem = {
  id: string;
  assetNumber: string;
  name: string;
  acquisitionDate: string | null;
  acquisitionCost: number;
  locationName: string | null;
  availableForUseDate: string | null;
  usefulLifeMonths: number | null;
  residualValue: number | null;
  status: string;
  sourceType: string | null;
  accumulated: number;
  bookValue: number;
  missing: string[];
};

export type FixedAssetPolicyView = { capitalizationThreshold: number; defaultUsefulLifeMonths: number; confirmedAt: string | null; confirmedBy: string | null };

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
const STATUS: Record<string, string> = { DRAFT: "Data belum lengkap", ACTIVE: "Disusutkan", FULLY_DEPRECIATED: "Habis disusutkan", DISPOSED: "Dilepas" };

export function FixedAssetsView({ assets, policy, canManage, defaultPeriod }: { assets: FixedAssetItem[]; policy: FixedAssetPolicyView; canManage: boolean; defaultPeriod: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState(String(policy.capitalizationThreshold));
  const [life, setLife] = useState(String(policy.defaultUsefulLifeMonths));

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/fixed-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      showToast(json.message || (json.success ? "Tersimpan." : "Gagal."), json.success ? "success" : "error");
      if (json.success) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const totals = assets.reduce((s, a) => ({ cost: s.cost + a.acquisitionCost, acc: s.acc + a.accumulated, book: s.book + a.bookValue }), { cost: 0, acc: 0, book: 0 });
  const incomplete = assets.filter((a) => a.missing.length).length;
  const input = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      <section className="aj-surface grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Kebijakan</p>
          <p className="mt-1 text-slate-700">
            Peralatan seharga <b>{rp(policy.capitalizationThreshold)}</b> ke atas dicatat sebagai aset tetap (1-2001), di bawahnya langsung biaya.
            Penyusutan garis lurus <b>{policy.defaultUsefulLifeMonths} bulan</b>, mulai bulan aset siap dipakai.
          </p>
          <p className={`mt-1 text-xs ${policy.confirmedAt ? "text-slate-500" : "font-semibold text-amber-700"}`}>
            {policy.confirmedAt ? `Dikonfirmasi ${policy.confirmedBy ?? ""} · ${day(policy.confirmedAt)}` : "Belum dikonfirmasi pemilik. Angka di atas dari keputusan awal (aset ≥ Rp 1 juta, umur 1 tahun)."}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-700">Batas (Rp)<input className={`${input} w-32`} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
            <label className="text-xs font-semibold text-slate-700">Umur (bulan)<input className={`${input} w-20`} inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} /></label>
            <Button className="min-h-10" variant="secondary" disabled={busy} onClick={() => post({ action: "confirm_policy", capitalizationThreshold: Number(threshold), defaultUsefulLifeMonths: Number(life) })}>
              {policy.confirmedAt ? "Simpan kebijakan" : "Konfirmasi kebijakan"}
            </Button>
          </div>
        )}
      </section>

      <section className="aj-surface flex flex-wrap items-end justify-between gap-3 p-4 text-sm">
        <p>
          {assets.length} aset · perolehan <b>{rp(totals.cost)}</b> · akumulasi penyusutan <b>{rp(totals.acc)}</b> · nilai buku <b>{rp(totals.book)}</b>
          {incomplete > 0 && <span className="text-amber-700"> · {incomplete} belum lengkap, tidak disusutkan</span>}
        </p>
        {canManage && (
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-slate-700">Periode<input type="month" className={`${input} w-40`} value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
            <Button className="min-h-10" disabled={busy || !period} onClick={() => post({ action: "depreciate", period })}>Posting penyusutan</Button>
          </div>
        )}
      </section>

      <section className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Aset</th>
              <th className="px-3 py-2">Perolehan</th>
              <th className="px-3 py-2">Siap pakai · umur</th>
              <th className="px-3 py-2 text-right">Akumulasi</th>
              <th className="px-3 py-2 text-right">Nilai buku</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((a) => (
              <AssetRow key={a.id} asset={a} open={editing === a.id} canManage={canManage} onToggle={() => setEditing(editing === a.id ? null : a.id)} onSaved={() => { setEditing(null); router.refresh(); }} />
            ))}
            {!assets.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-600">Belum ada aset tetap. Peralatan Rp 1 juta ke atas dari Pengeluaran (tujuan: Peralatan) otomatis masuk ke sini.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AssetRow({ asset: a, open, canManage, onToggle, onSaved }: { asset: FixedAssetItem; open: boolean; canManage: boolean; onToggle: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const iso = (v: string | null) => (v ? v.slice(0, 10) : "");
  const [f, setF] = useState({
    name: a.name, locationName: a.locationName ?? "", acquisitionDate: iso(a.acquisitionDate), availableForUseDate: iso(a.availableForUseDate),
    usefulLifeMonths: a.usefulLifeMonths ? String(a.usefulLifeMonths) : "", residualValue: a.residualValue == null ? "" : String(a.residualValue)
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounting/fixed-assets/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          locationName: f.locationName || null,
          acquisitionDate: f.acquisitionDate || null,
          availableForUseDate: f.availableForUseDate || null,
          usefulLifeMonths: f.usefulLifeMonths ? Number(f.usefulLifeMonths) : null,
          residualValue: f.residualValue === "" ? null : Number(f.residualValue)
        })
      });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan.", "error");
      showToast(`${a.assetNumber} disimpan.`, "success");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const input = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <>
      <tr className={open ? "bg-emerald-50" : undefined}>
        <td className="px-3 py-2"><p className="font-medium text-slate-900">{a.name}</p><p className="text-xs text-slate-500">{a.assetNumber}{a.locationName ? ` · ${a.locationName}` : ""}</p></td>
        <td className="whitespace-nowrap px-3 py-2">{rp(a.acquisitionCost)}<p className="text-xs text-slate-500">{day(a.acquisitionDate)}</p></td>
        <td className="whitespace-nowrap px-3 py-2">{day(a.availableForUseDate)}<p className="text-xs text-slate-500">{a.usefulLifeMonths ? `${a.usefulLifeMonths} bulan` : "-"}{a.residualValue != null ? ` · residu ${rp(a.residualValue)}` : ""}</p></td>
        <td className="px-3 py-2 text-right tabular-nums">{rp(a.accumulated)}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">{rp(a.bookValue)}</td>
        <td className="px-3 py-2 text-xs">{a.missing.length ? <span className="text-amber-700">Lengkapi: {a.missing.join(", ")}</span> : STATUS[a.status] ?? a.status}</td>
        <td className="px-3 py-2 text-right">{canManage && <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" onClick={onToggle}>{open ? "Tutup" : "Ubah"}</button>}</td>
      </tr>
      {open && (
        <tr className="bg-emerald-50/60">
          <td colSpan={7} className="px-3 pb-3">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Nama<input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-700">Lokasi<input className={input} value={f.locationName} onChange={(e) => setF({ ...f, locationName: e.target.value })} placeholder="Toko / Gudang" /></label>
              <label className="text-xs font-semibold text-slate-700">Tgl perolehan<input type="date" className={input} value={f.acquisitionDate} onChange={(e) => setF({ ...f, acquisitionDate: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-700">Siap dipakai<input type="date" className={input} value={f.availableForUseDate} onChange={(e) => setF({ ...f, availableForUseDate: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-700">Umur (bulan)<input className={input} inputMode="numeric" value={f.usefulLifeMonths} onChange={(e) => setF({ ...f, usefulLifeMonths: e.target.value })} placeholder="12" /></label>
              <label className="text-xs font-semibold text-slate-700">Nilai residu (Rp)<input className={input} inputMode="numeric" value={f.residualValue} onChange={(e) => setF({ ...f, residualValue: e.target.value })} placeholder="0" /></label>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" className="min-h-10" onClick={onToggle}>Batal</Button>
              <Button className="min-h-10" onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
