"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

type Props = { tempoId: string; action: "cancel" | "write-off" };

export function TempoActionForm({ tempoId, action }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const label = action === "cancel" ? "Cancel Tempo" : "Write-off Tempo";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/tempo/${tempoId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: String(form.get("reason") || "") })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setNotice({ type: "error", message: result?.message || `${label} gagal.` });
      return;
    }
    setNotice({ type: "success", message: `${label} berhasil.` });
    router.refresh();
  }

  return <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 p-4">{notice && <Toast {...notice} />}<h3 className="font-bold">{label}</h3><label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Alasan</span><Textarea name="reason" rows={2} required minLength={5} /></label><Button type="submit" className="w-full" variant={action === "cancel" ? "secondary" : "primary"}>{label}</Button></form>;
}
