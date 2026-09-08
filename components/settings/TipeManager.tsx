"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";

type Props = { types: BookkeepingType[]; rekenings: RekeningAccount[] };

export function TipeManager({ types: initial, rekenings }: Props) {
  const { showToast } = useToast();
  const [types, setTypes] = useState(initial);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tipeToToggle, setTipeToToggle] = useState<{ tipe: BookkeepingType; targetStatus: boolean } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const rekeningsForTipe = (id: string) => rekenings.filter((r) => r.tipeIds.includes(id));
  const rekeningNamesForTipe = (id: string) => rekeningsForTipe(id).map((r) => r.name).join(", ") || "-";
  const statusBadge = (active: boolean) => (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );

  const addTipe = async () => {
    if (!newCode.trim()) {
      showToast("Kode tipe wajib diisi.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim() || newCode.trim() })
      });
      const result = await res.json();
      if (result.success) {
        setTypes((prev) => [...prev, result.data]);
        setNewCode("");
        setNewName("");
        showToast("Tipe pembukuan berhasil ditambahkan.", "success");
      } else {
        showToast(result.message || "Gagal menambah tipe.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menambah tipe.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmToggleStatus = async () => {
    if (!tipeToToggle) return;
    setIsUpdating(true);
    try {
      const updated = { ...tipeToToggle.tipe, isActive: tipeToToggle.targetStatus };
      const res = await fetch("/api/tipe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const result = await res.json();
      if (result.success) {
        setTypes((prev) => prev.map((t) => (t.id === tipeToToggle.tipe.id ? updated : t)));
        showToast(
          `Tipe ${updated.code} berhasil ${updated.isActive ? "diaktifkan" : "dinonaktifkan"}.`,
          "success"
        );
        setTipeToToggle(null);
      } else {
        showToast(result.message || "Gagal update tipe.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat memperbarui tipe.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="aj-surface">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h3 className="font-bold">Daftar Tipe Pembukuan</h3>
          <p className="mt-1 text-xs text-slate-500">Nonaktifkan tipe yang sudah tidak dipakai. Jangan hapus jika masih ada transaksi.</p>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {types.map((tipe) => (
            <article key={tipe.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-base font-semibold text-slate-900">{tipe.code}</p>
                  <p className="mt-1 text-sm text-slate-600">{tipe.name}</p>
                </div>
                {statusBadge(tipe.isActive)}
              </div>
              <dl className="mt-4 text-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rekening terhubung</dt>
                <dd className="mt-1 text-slate-600">{rekeningNamesForTipe(tipe.id)}</dd>
              </dl>
              <button
                type="button"
                onClick={() => setTipeToToggle({ tipe, targetStatus: !tipe.isActive })}
                className={`mt-4 min-h-9 w-full rounded-sm border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                  tipe.isActive
                    ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                    : "border-neutral-300 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {tipe.isActive ? "Nonaktifkan" : "Aktifkan"}
              </button>
            </article>
          ))}
        </div>
        <p className="hidden px-5 pt-3 text-xs text-slate-500 md:block lg:hidden">Geser tabel untuk melihat kolom lainnya.</p>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Kode</th>
                <th className="px-5 py-3">Nama</th>
                <th className="px-5 py-3">Rekening terhubung</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {types.map((tipe) => (
                <tr key={tipe.id} className="border-b border-slate-100">
                  <td className="px-5 py-4 font-mono font-semibold">{tipe.code}</td>
                  <td className="px-5 py-4">{tipe.name}</td>
                  <td className="px-5 py-4 text-slate-500">{rekeningNamesForTipe(tipe.id)}</td>
                  <td className="px-5 py-4">{statusBadge(tipe.isActive)}</td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setTipeToToggle({ tipe, targetStatus: !tipe.isActive })}
                      className={`text-sm font-semibold cursor-pointer transition-colors ${
                        tipe.isActive ? "text-rose-600 hover:text-rose-800" : "text-emerald-700 hover:text-emerald-800"
                      }`}
                    >
                      {tipe.isActive ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aj-surface max-w-lg p-5 sm:p-6">
        <h3 className="font-bold">Tambah Tipe Baru</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">Kode <span className="text-red-500">*</span></span>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Masukkan kode tipe resmi" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">Nama tampilan</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Masukkan nama tampilan resmi" />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Nama tampilan opsional. Jika kosong, menggunakan kode.</p>
        <Button className="mt-4" onClick={addTipe} disabled={saving}>{saving ? "Menyimpan..." : "Tambah Tipe"}</Button>
      </section>

      {/* Confirmation Modal for Toggle Tipe Status */}
      <ConfirmationModal
        isOpen={Boolean(tipeToToggle)}
        title={tipeToToggle?.targetStatus ? "Aktifkan Tipe Pembukuan" : "Nonaktifkan Tipe Pembukuan"}
        message={
          tipeToToggle
            ? tipeToToggle.targetStatus
              ? `Aktifkan kembali tipe pembukuan "${tipeToToggle.tipe.name || tipeToToggle.tipe.code}"? Tipe ini akan muncul kembali di opsi pilihan transaksi baru.`
              : `Nonaktifkan tipe pembukuan "${tipeToToggle.tipe.name || tipeToToggle.tipe.code}"? Tipe ini tidak akan muncul di opsi transaksi baru. Riwayat transaksi lama tetap tersimpan.`
            : ""
        }
        confirmLabel={tipeToToggle?.targetStatus ? "Ya, Aktifkan" : "Ya, Nonaktifkan"}
        cancelLabel="Batal"
        variant={tipeToToggle?.targetStatus ? "primary" : "danger"}
        isLoading={isUpdating}
        onConfirm={confirmToggleStatus}
        onCancel={() => {
          if (!isUpdating) setTipeToToggle(null);
        }}
      />
    </div>
  );
}
