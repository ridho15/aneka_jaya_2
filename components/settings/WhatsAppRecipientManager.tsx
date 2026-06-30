"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { WhatsAppRecipient } from "@/lib/whatsapp/types";

type FormState = {
  id?: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
  receivesDailyReport: boolean;
  receivesStockAlert: boolean;
  receivesTempoReminder: boolean;
};

const emptyForm: FormState = {
  name: "",
  phoneNumber: "",
  isActive: true,
  receivesDailyReport: true,
  receivesStockAlert: false,
  receivesTempoReminder: false
};

function maskPhone(value: string) {
  const text = value.replace(/[^\d+]/g, "");
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-3)}`;
}

export function WhatsAppRecipientManager({ initialRecipients }: { initialRecipients: WhatsAppRecipient[] }) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  const setField = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const edit = (recipient: WhatsAppRecipient) => setForm({
    id: recipient.id,
    name: recipient.name,
    phoneNumber: recipient.phoneNumber,
    isActive: recipient.isActive,
    receivesDailyReport: recipient.receivesDailyReport,
    receivesStockAlert: recipient.receivesStockAlert,
    receivesTempoReminder: recipient.receivesTempoReminder
  });
  const reset = () => setForm(emptyForm);
  const save = async () => {
    const response = await fetch("/api/whatsapp/recipients", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setNotice({ type: "error", message: result?.message || "Recipient WhatsApp gagal disimpan." });
      return;
    }
    setRecipients((current) => {
      const next = result.data as WhatsAppRecipient;
      return form.id ? current.map((row) => row.id === next.id ? next : row) : [next, ...current];
    });
    setNotice({ type: "success", message: "Recipient WhatsApp berhasil disimpan." });
    reset();
  };
  const deactivate = async (recipient: WhatsAppRecipient) => {
    const response = await fetch("/api/whatsapp/recipients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recipient.id, isActive: false })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setNotice({ type: "error", message: result?.message || "Recipient WhatsApp gagal dinonaktifkan." });
      return;
    }
    setRecipients((current) => current.map((row) => row.id === recipient.id ? result.data : row));
    setNotice({ type: "success", message: "Recipient WhatsApp dinonaktifkan." });
  };

  return <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
    <section className="aj-surface overflow-x-auto">
      <div className="border-b border-slate-100 p-5">
        <h3 className="font-bold">Recipient WhatsApp</h3>
        <p className="mt-1 text-sm text-slate-500">Nomor hanya dipakai server-side saat pengiriman.</p>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Nomor</th><th className="px-5 py-3">Daily</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Tempo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Aksi</th></tr></thead>
        <tbody>{recipients.map((row) => <tr key={row.id} className="border-b border-slate-100">
          <td className="px-5 py-4 font-semibold">{row.name}</td>
          <td className="px-5 py-4">{maskPhone(row.phoneNumber)}</td>
          <td className="px-5 py-4">{row.receivesDailyReport ? "Ya" : "Tidak"}</td>
          <td className="px-5 py-4">{row.receivesStockAlert ? "Ya" : "Tidak"}</td>
          <td className="px-5 py-4">{row.receivesTempoReminder ? "Ya" : "Tidak"}</td>
          <td className="px-5 py-4">{row.isActive ? "Aktif" : "Nonaktif"}</td>
          <td className="px-5 py-4"><div className="flex gap-2"><button className="font-bold text-emerald-700" type="button" onClick={() => edit(row)}>Edit</button>{row.isActive && <button className="font-bold text-red-700" type="button" onClick={() => deactivate(row)}>Nonaktifkan</button>}</div></td>
        </tr>)}{recipients.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Belum ada recipient WhatsApp.</td></tr>}</tbody>
      </table>
    </section>
    <section className="aj-surface p-6">
      <h3 className="font-bold">{form.id ? "Edit Recipient" : "Tambah Recipient"}</h3>
      {notice && <div className="mt-3"><Toast {...notice} /></div>}
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-semibold text-slate-700">Nama<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.name} onChange={(event) => setField("name", event.target.value)} /></label>
        <label className="block text-sm font-semibold text-slate-700">Nomor WhatsApp<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="62812..." value={form.phoneNumber} onChange={(event) => setField("phoneNumber", event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setField("isActive", event.target.checked)} /> Aktif</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.receivesDailyReport} onChange={(event) => setField("receivesDailyReport", event.target.checked)} /> Terima daily report</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.receivesStockAlert} onChange={(event) => setField("receivesStockAlert", event.target.checked)} /> Terima stock alert</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.receivesTempoReminder} onChange={(event) => setField("receivesTempoReminder", event.target.checked)} /> Terima tempo reminder</label>
        <div className="flex gap-2"><Button type="button" onClick={save}>Simpan</Button>{form.id && <Button type="button" variant="secondary" onClick={reset}>Batal</Button>}</div>
      </div>
    </section>
  </div>;
}
