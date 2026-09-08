"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

export type WhatsAppRecipient = {
  id: string;
  name: string;
  phoneNumber: string;
  receivesDailyReport: boolean;
  receivesStockAlert: boolean;
  receivesTempoReminder: boolean;
  isActive: boolean;
};

const emptyForm: Omit<WhatsAppRecipient, "id"> & { id?: string } = {
  name: "",
  phoneNumber: "",
  receivesDailyReport: true,
  receivesStockAlert: true,
  receivesTempoReminder: true,
  isActive: true
};

type Props = {
  initialRecipients?: WhatsAppRecipient[];
  recipients?: WhatsAppRecipient[];
};

export function WhatsAppRecipientManager({ initialRecipients, recipients: propRecipients }: Props) {
  const { showToast } = useToast();
  const [recipients, setRecipients] = useState(initialRecipients ?? propRecipients ?? []);
  const [form, setForm] = useState(emptyForm);
  const [recipientToDeactivate, setRecipientToDeactivate] = useState<WhatsAppRecipient | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const maskPhone = (phone: string) => {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + "••••" + phone.slice(-2);
  };

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const edit = (recipient: WhatsAppRecipient) => {
    setForm({ ...recipient });
  };

  const reset = () => {
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phoneNumber.trim()) {
      showToast("Nama dan nomor WhatsApp wajib diisi.", "error");
      return;
    }

    try {
      const response = await fetch("/api/whatsapp/recipients", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        showToast(result?.message || "Recipient WhatsApp gagal disimpan.", "error");
        return;
      }
      setRecipients((current) => {
        const next = result.data as WhatsAppRecipient;
        return form.id ? current.map((row) => (row.id === next.id ? next : row)) : [next, ...current];
      });
      showToast("Recipient WhatsApp berhasil disimpan.", "success");
      reset();
    } catch {
      showToast("Terjadi kesalahan jaringan saat menyimpan recipient.", "error");
    }
  };

  const confirmDeactivate = async () => {
    if (!recipientToDeactivate) return;
    setIsDeactivating(true);
    try {
      const response = await fetch("/api/whatsapp/recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipientToDeactivate.id, isActive: false })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        showToast(result?.message || "Recipient WhatsApp gagal dinonaktifkan.", "error");
        return;
      }
      setRecipients((current) => current.map((row) => (row.id === recipientToDeactivate.id ? result.data : row)));
      showToast(`Recipient WhatsApp ${recipientToDeactivate.name} berhasil dinonaktifkan.`, "success");
      setRecipientToDeactivate(null);
    } catch {
      showToast("Terjadi kesalahan jaringan saat menonaktifkan recipient.", "error");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <section className="aj-surface overflow-x-auto">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-bold">Recipient WhatsApp</h3>
          <p className="mt-1 text-sm text-slate-500">Nomor hanya dipakai server-side saat pengiriman laporan otomatis.</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Nomor</th>
              <th className="px-5 py-3">Daily</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Tempo</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="px-5 py-4 font-semibold">{row.name}</td>
                <td className="px-5 py-4">{maskPhone(row.phoneNumber)}</td>
                <td className="px-5 py-4">{row.receivesDailyReport ? "Ya" : "Tidak"}</td>
                <td className="px-5 py-4">{row.receivesStockAlert ? "Ya" : "Tidak"}</td>
                <td className="px-5 py-4">{row.receivesTempoReminder ? "Ya" : "Tidak"}</td>
                <td className="px-5 py-4">{row.isActive ? "Aktif" : "Nonaktif"}</td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <button className="font-bold text-emerald-700 cursor-pointer" type="button" onClick={() => edit(row)}>
                      Edit
                    </button>
                    {row.isActive && (
                      <button
                        className="font-bold text-rose-600 hover:text-rose-800 cursor-pointer transition-colors"
                        type="button"
                        onClick={() => setRecipientToDeactivate(row)}
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  Belum ada recipient WhatsApp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="aj-surface p-6">
        <h3 className="font-bold">{form.id ? "Edit Recipient" : "Tambah Recipient"}</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            Nama
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="Nama penerima"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Nomor WhatsApp
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="62812..."
              value={form.phoneNumber}
              onChange={(event) => setField("phoneNumber", event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setField("isActive", event.target.checked)} /> Aktif
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.receivesDailyReport} onChange={(event) => setField("receivesDailyReport", event.target.checked)} /> Terima daily report
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.receivesStockAlert} onChange={(event) => setField("receivesStockAlert", event.target.checked)} /> Terima stock alert
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.receivesTempoReminder} onChange={(event) => setField("receivesTempoReminder", event.target.checked)} /> Terima tempo reminder
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="button" onClick={save}>Simpan</Button>
            {form.id && <Button type="button" variant="secondary" onClick={reset}>Batal</Button>}
          </div>
        </div>
      </section>

      {/* Confirmation Modal for Deactivating WhatsApp Recipient */}
      <ConfirmationModal
        isOpen={Boolean(recipientToDeactivate)}
        title="Nonaktifkan Penerima WhatsApp"
        message={
          recipientToDeactivate
            ? `Apakah Anda yakin ingin menonaktifkan penerima "${recipientToDeactivate.name}" (${maskPhone(recipientToDeactivate.phoneNumber)})? Nomor ini tidak akan lagi menerima laporan harian, alert stok, atau pengingat tempo otomatis.`
            : ""
        }
        confirmLabel="Ya, Nonaktifkan"
        cancelLabel="Batal"
        variant="danger"
        isLoading={isDeactivating}
        onConfirm={confirmDeactivate}
        onCancel={() => {
          if (!isDeactivating) setRecipientToDeactivate(null);
        }}
      />
    </div>
  );
}
