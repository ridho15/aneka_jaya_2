"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

type Location = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE"; address: string | null; phone: string | null; erpWarehouseId: number | null; allowNegative: boolean; isDefault: boolean; isActive: boolean };
const empty = { code: "", name: "", type: "WAREHOUSE" as Location["type"], address: "", phone: "", erpWarehouseId: "", allowNegative: false, isDefault: false, isActive: true };

export function LocationManager({ locations, canManage }: { locations: Location[]; canManage: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { ...form, erpWarehouseId: form.erpWarehouseId ? Number(form.erpWarehouseId) : null };
      const res = await fetch(editingId ? `/api/inventory/locations/${editingId}` : "/api/inventory/locations", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) return showToast(json.message || "Gagal menyimpan lokasi.", "error");
      showToast("Lokasi tersimpan.", "success");
      setForm(empty); setEditingId(null); router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Kode</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Jenis</th><th className="px-3 py-2">ID Gudang ERP</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono font-semibold">{l.code}</td>
                <td className="px-3 py-2">{l.name}{l.isDefault && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">DEFAULT</span>}<div className="text-xs text-slate-500">{l.address}</div></td>
                <td className="px-3 py-2">{l.type === "STORE" ? "Toko" : "Gudang"}</td>
                <td className="px-3 py-2">{l.erpWarehouseId ?? "-"}</td>
                <td className="px-3 py-2">{l.isActive ? "Aktif" : "Nonaktif"}{l.allowNegative && " • boleh minus"}</td>
                <td className="px-3 py-2 text-right">{canManage && <button className="text-xs font-semibold text-emerald-700" onClick={() => { setEditingId(l.id); setForm({ code: l.code, name: l.name, type: l.type, address: l.address ?? "", phone: l.phone ?? "", erpWarehouseId: l.erpWarehouseId ? String(l.erpWarehouseId) : "", allowNegative: l.allowNegative, isDefault: l.isDefault, isActive: l.isActive }); }}>Ubah</button>}</td>
              </tr>
            ))}
            {!locations.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Belum ada gudang/toko.</td></tr>}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="aj-surface space-y-4 p-5">
          <h3 className="font-bold text-slate-800">{editingId ? "Ubah Lokasi" : "Tambah Gudang / Toko"}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm font-semibold"><span>Kode</span><input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="GD-UTAMA / TK-PUSAT" /></label>
            <label className="space-y-1 text-sm font-semibold"><span>Nama</span><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-semibold"><span>Jenis</span>
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Location["type"] })}><option value="WAREHOUSE">Gudang</option><option value="STORE">Toko</option></select>
            </label>
            <label className="space-y-1 text-sm font-semibold"><span>Alamat</span><input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-semibold"><span>Telepon</span><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-semibold"><span>ID Gudang ERP (pemetaan, opsional)</span><input className={input} inputMode="numeric" value={form.erpWarehouseId} onChange={(e) => setForm({ ...form, erpWarehouseId: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Lokasi default penjualan/penerimaan</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowNegative} onChange={(e) => setForm({ ...form, allowNegative: e.target.checked })} /> Izinkan stok minus</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Aktif</label>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && <Button variant="secondary" onClick={() => { setEditingId(null); setForm(empty); }}>Batal</Button>}
            <Button onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
