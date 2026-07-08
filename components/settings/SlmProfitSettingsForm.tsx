"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import type { OperationalProfitSetting } from "@/lib/settings/profit";

export function SlmProfitSettingsForm({ initialSetting }: { initialSetting: OperationalProfitSetting }) {
  const [grossProfitPercent, setGrossProfitPercent] = useState(String(initialSetting.grossProfitPercent));
  const [current, setCurrent] = useState(initialSetting);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/settings/profit-slm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grossProfitPercent })
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.success) {
      setCurrent(result.data);
      setGrossProfitPercent(String(result.data.grossProfitPercent));
      setNotice({ type: "success", message: "Setting Profit Operasional berhasil disimpan." });
    } else {
      setNotice({ type: "error", message: result?.message || "Setting Profit Operasional gagal disimpan." });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {notice && <Toast {...notice} />}
      <section className="aj-surface max-w-xl p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Profit Operasional</p>
        <h3 className="mt-1 text-lg font-bold">Persentase Gross Profit</h3>
        <p className="mt-2 text-sm text-slate-600">Dashboard memakai persentase ini untuk menghitung estimasi Gross Profit Operasional dari omzet approved bulanan non-AJ.</p>
        <div className="mt-5">
          <label className="block text-sm font-semibold text-slate-700">
            Gross Profit Operasional (%)
            <Input className="mt-1" inputMode="decimal" min={0} max={100} step="0.01" type="number" value={grossProfitPercent} onChange={(event) => setGrossProfitPercent(event.target.value)} />
          </label>
          <p className="mt-2 text-xs text-slate-500">Nilai saat ini: {current.grossProfitPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</p>
        </div>
        <Button className="mt-5" type="button" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Setting"}</Button>
      </section>
    </div>
  );
}
