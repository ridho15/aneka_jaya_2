"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";

type Props = { types: BookkeepingType[]; rekenings: RekeningAccount[] };

export function TipeManager({ types: initial, rekenings }: Props) {
  const [types, setTypes] = useState(initial);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const rekeningsForTipe = (id: string) => rekenings.filter((r) => r.tipeIds.includes(id));

  const addTipe = async () => {
    if (!newCode.trim()) { setNotice({ type: "error", message: "Kode tipe wajib diisi." }); return; }
    setSaving(true);
    const res = await fetch("/api/tipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: newCode.trim(), name: newName.trim() || newCode.trim() }) });
    const result = await res.json();
    if (result.success) { setTypes((prev) => [...prev, result.data]); setNewCode(""); setNewName(""); setNotice({ type: "success", message: "Tipe berhasil ditambahkan." }); }
    else setNotice({ type: "error", message: result.message || "Gagal menambah tipe." });
    setSaving(false);
  };

  const toggleActive = async (tipe: BookkeepingType) => {
    const updated = { ...tipe, isActive: !tipe.isActive };
    const res = await fetch("/api/tipe", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    const result = await res.json();
    if (result.success) { setTypes((prev) => prev.map((t) => t.id === tipe.id ? updated : t)); setNotice({ type: "success", message: `Tipe ${updated.isActive ? "diaktifkan" : "dinonaktifkan"}.` }); }
    else setNotice({ type: "error", message: result.message || "Gagal update tipe." });
  };

  return (
    <div className="space-y-6">
      {notice && <Toast {...notice} />}
      <section className="aj-surface overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h3 className="font-bold">Daftar Tipe Pembukuan</h3>
          <p className="mt-1 text-xs text-slate-500">Nonaktifkan tipe yang sudah tidak dipakai. Jangan hapus jika masih ada transaksi.</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama</th><th className="px-5 py-3">Rekening terhubung</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {types.map((tipe) => (
              <tr key={tipe.id} className="border-b border-slate-100">
                <td className="px-5 py-4 font-mono font-semibold">{tipe.code}</td>
                <td className="px-5 py-4">{tipe.name}</td>
                <td className="px-5 py-4 text-slate-500">{rekeningsForTipe(tipe.id).map((r) => r.name).join(", ") || "-"}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tipe.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{tipe.isActive ? "Aktif" : "Nonaktif"}</span></td>
                <td className="px-5 py-4"><button onClick={() => toggleActive(tipe)} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">{tipe.isActive ? "Nonaktifkan" : "Aktifkan"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="aj-surface max-w-lg p-5 sm:p-6">
        <h3 className="font-bold">Tambah Tipe Baru</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Kode <span className="text-red-500">*</span></span><Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Masukkan kode tipe resmi" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Nama tampilan</span><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Masukkan nama tampilan resmi" /></label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Nama tampilan opsional. Jika kosong, menggunakan kode.</p>
        <Button className="mt-4" onClick={addTipe} disabled={saving}>{saving ? "Menyimpan..." : "Tambah Tipe"}</Button>
      </section>
    </div>
  );
}
