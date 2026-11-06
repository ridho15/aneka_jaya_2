"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { RupiahInput } from "@/components/ui/RupiahInput";
import { calculateCost } from "@/lib/inventory/costCalculator";

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const num = (v: string) => Number(v.replace(",", ".")) || 0;

export function CostCalculator({ defaultRmbRate, defaultCbmRate }: { defaultRmbRate: number | null; defaultCbmRate: number | null }) {
  const [priceRmb, setPriceRmb] = useState("");
  const [unitKind, setUnitKind] = useState<"Lusin" | "Pack">("Lusin");
  const [packSize, setPackSize] = useState("10");
  const [unitsPerKoli, setUnitsPerKoli] = useState("60");
  const [cbmPerKoli, setCbmPerKoli] = useState("0.5");
  const router = useRouter();
  const { showToast } = useToast();
  // Kurs & tarif selalu dari Master Barang; diubah di sini = mengubah standar untuk semua barang.
  const [rmbRate, setRmbRate] = useState(defaultRmbRate ? String(Math.round(defaultRmbRate)) : "");
  const [cbmRate, setCbmRate] = useState(defaultCbmRate ? String(Math.round(defaultCbmRate)) : "");
  const [editingRates, setEditingRates] = useState(!defaultRmbRate || !defaultCbmRate);
  const [savingRates, setSavingRates] = useState(false);

  async function saveRates() {
    if (!(num(rmbRate) > 0) || !(num(cbmRate) > 0)) return showToast("Isi kurs RMB dan tarif CBM.", "error");
    setSavingRates(true);
    try {
      const put = async (url: string, rate: number) => {
        const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate }) });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Gagal menyimpan.");
      };
      if (num(rmbRate) !== (defaultRmbRate ?? 0)) await put("/api/inventory/settings/rmb-rate", num(rmbRate));
      if (num(cbmRate) !== (defaultCbmRate ?? 0)) await put("/api/inventory/settings/cbm-rate", num(cbmRate));
      showToast("Kurs & tarif standar disimpan. Modal barang ber-harga RMB ikut dihitung ulang.", "success");
      setEditingRates(false);
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan.", "error");
    } finally {
      setSavingRates(false);
    }
  }
  const [sell, setSell] = useState("");

  const pcsPerUnit = unitKind === "Lusin" ? 12 : num(packSize);
  const r = calculateCost({
    priceRmbPerPcs: num(priceRmb), pcsPerUnit, unitsPerKoli: num(unitsPerKoli), cbmPerKoli: num(cbmPerKoli),
    rmbRate: num(rmbRate), cbmRate: num(cbmRate), sellingPricePerUnit: num(sell)
  });
  const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums";
  const label = "space-y-1 text-xs font-semibold text-slate-700";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="aj-surface space-y-4 p-4 sm:p-5">
        <h3 className="font-semibold text-slate-900">Isi data barang</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}><span>Harga per pcs (RMB)</span>
            <input className={input} inputMode="decimal" value={priceRmb} onChange={(e) => setPriceRmb(e.target.value)} placeholder="1.5" />
          </label>
          <label className={label}><span>Satuan jual</span>
            <select className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={unitKind} onChange={(e) => setUnitKind(e.target.value as "Lusin" | "Pack")}>
              <option value="Lusin">Lusin (12 pcs)</option>
              <option value="Pack">Pack</option>
            </select>
          </label>
          {unitKind === "Pack" && (
            <label className={label}><span>1 pack isi berapa pcs</span>
              <input className={input} inputMode="numeric" value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="10" />
            </label>
          )}
          <label className={label}><span>1 koli muat berapa {unitKind.toLowerCase()}</span>
            <input className={input} inputMode="decimal" value={unitsPerKoli} onChange={(e) => setUnitsPerKoli(e.target.value)} placeholder="60" />
          </label>
          <label className={label}><span>1 koli berapa CBM</span>
            <input className={input} inputMode="decimal" value={cbmPerKoli} onChange={(e) => setCbmPerKoli(e.target.value)} placeholder="0.5" />
          </label>
        </div>
        <div className="border-t border-slate-100 pt-4">
          {editingRates ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">{defaultRmbRate && defaultCbmRate ? "Ubah kurs & tarif standar (berlaku untuk semua barang)." : "Kurs & tarif standar belum diatur. Isi sekali, lalu dipakai otomatis di sini dan di Master Barang."}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}><span>Kurs per 1 RMB</span><RupiahInput value={rmbRate} onChange={setRmbRate} placeholder="2.800" ariaLabel="Kurs per 1 RMB" /></label>
                <label className={label}><span>Tarif per CBM</span><RupiahInput value={cbmRate} onChange={setCbmRate} placeholder="3.500.000" ariaLabel="Tarif per CBM" /></label>
              </div>
              <div className="flex justify-end gap-2">
                {defaultRmbRate && defaultCbmRate ? <Button variant="secondary" className="min-h-10" onClick={() => { setRmbRate(String(Math.round(defaultRmbRate))); setCbmRate(String(Math.round(defaultCbmRate))); setEditingRates(false); }}>Batal</Button> : null}
                <Button className="min-h-10" disabled={savingRates} onClick={saveRates}>{savingRates ? "Menyimpan..." : "Simpan sebagai standar"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p>Kurs <b>Rp {num(rmbRate).toLocaleString("id-ID")}</b>/RMB · Tarif <b>Rp {num(cbmRate).toLocaleString("id-ID")}</b>/CBM<span className="block text-xs text-slate-500">Dari Master Barang</span></p>
              <button type="button" className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" onClick={() => setEditingRates(true)}>Ubah</button>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}><span>Harga jual per {unitKind.toLowerCase()} (opsional)</span>
            <RupiahInput value={sell} onChange={setSell} placeholder="0" ariaLabel="Harga jual" />
          </label>
        </div>
      </section>

      <section className="aj-surface p-4 sm:p-5">
        <h3 className="font-semibold text-slate-900">Hasil</h3>
        {!r ? (
          <p className="mt-3 text-sm text-slate-500">Isi isi koli dan isi pcs per {unitKind.toLowerCase()}.</p>
        ) : (
          <>
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              <Row label="Ongkir per koli" note={`${num(cbmPerKoli).toLocaleString("id-ID")} CBM × ${rp(num(cbmRate))}`} value={rp(r.freightPerKoli)} />
              <Row label={`Ongkir per ${unitKind.toLowerCase()}`} note={`÷ ${num(unitsPerKoli).toLocaleString("id-ID")} ${unitKind.toLowerCase()} per koli`} value={rp(r.freightPerUnit)} />
              <Row label="Ongkir per pcs" note={`÷ ${pcsPerUnit} pcs per ${unitKind.toLowerCase()}`} value={rp(r.freightPerPcs)} />
              <Row label={`Harga barang per ${unitKind.toLowerCase()}`} note={`¥${r.priceRmbPerUnit.toLocaleString("id-ID")} × ${rp(num(rmbRate))}`} value={rp(r.goodsPerUnit)} />
              <Row label="Harga barang per pcs" value={rp(r.goodsPerPcs)} />
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-emerald-50 p-3">
              <div><p className="text-xs font-semibold text-emerald-900">Modal per {unitKind.toLowerCase()}</p><p className="text-xl font-bold tabular-nums text-emerald-950">{rp(r.costPerUnit)}</p></div>
              <div><p className="text-xs font-semibold text-emerald-900">Modal per pcs</p><p className="text-xl font-bold tabular-nums text-emerald-950">{rp(r.costPerPcs)}</p></div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              1 koli = {r.pcsPerKoli.toLocaleString("id-ID")} pcs · modal 1 koli {rp(r.costPerKoli)} · CBM per {unitKind.toLowerCase()} {r.cbmPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 6 })}
              {r.markupPercent != null && <> · mark-up <b className={r.markupPercent < 0 ? "text-rose-700" : "text-slate-900"}>{r.markupPercent.toLocaleString("id-ID")}%</b></>}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Row({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt>{label}{note && <span className="block text-xs text-slate-500">{note}</span>}</dt>
      <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
