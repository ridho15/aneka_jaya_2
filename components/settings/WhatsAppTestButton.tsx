"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type Props = {
  recipients: Array<{ id: string; name: string; isActive: boolean }>;
};

export function WhatsAppTestButton({ recipients }: Props) {
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [recipientId, setRecipientId] = useState(recipients.find((row) => row.isActive)?.id || "");
  const send = async () => {
    const response = await fetch("/api/whatsapp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId })
    });
    const result = await response.json().catch(() => null);
    setNotice(response.ok && result?.success ? { type: "success", message: "Kirim Test WhatsApp berhasil dicatat." } : { type: "error", message: result?.message || "Test WhatsApp gagal." });
  };
  return <div className="mt-4 space-y-3">
    {notice && <Toast {...notice} />}
    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
      <option value="">Pilih recipient aktif</option>
      {recipients.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select>
    <Button type="button" onClick={send} disabled={!recipientId}>Kirim Test WhatsApp</Button>
  </div>;
}
