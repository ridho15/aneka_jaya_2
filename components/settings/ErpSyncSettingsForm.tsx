"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { ErpSyncSetting } from "@/lib/settings/erpSync";

export function ErpSyncSettingsForm({ initialSetting }: { initialSetting: ErpSyncSetting }) {
  const [autoSyncAfterSalesEdit, setAutoSyncAfterSalesEdit] = useState(initialSetting.autoSyncAfterSalesEdit);
  const [current, setCurrent] = useState(initialSetting);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/settings/erp-sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoSyncAfterSalesEdit })
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.success) {
      setCurrent(result.data);
      setAutoSyncAfterSalesEdit(result.data.autoSyncAfterSalesEdit);
      setNotice({ type: "success", message: "Setting ERP Sync berhasil disimpan." });
    } else {
      setNotice({ type: "error", message: result?.message || "Setting ERP Sync gagal disimpan." });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {notice && <Toast {...notice} />}
      <section className="aj-surface max-w-xl p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">ERP Sync</p>
        <h3 className="mt-1 text-lg font-bold">Auto sync setelah edit penjualan ERP</h3>
        <p className="mt-2 text-sm text-slate-600">Jika aktif, transaksi ERP yang diedit akan langsung dicoba sinkron ulang. Jika ERP menolak karena stok/payment sudah diproses, status akan menjadi failed dan muncul di ERP Sync.</p>
        <label className="mt-5 flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={autoSyncAfterSalesEdit}
            onChange={(event) => setAutoSyncAfterSalesEdit(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Aktifkan auto sync setelah edit</span>
            <span className="mt-1 block text-xs text-slate-500">Nilai saat ini: {current.autoSyncAfterSalesEdit ? "Aktif" : "Manual"}</span>
          </span>
        </label>
        <Button className="mt-5" type="button" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Setting"}</Button>
      </section>
    </div>
  );
}
