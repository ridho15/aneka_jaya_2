"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

export function WhatsAppTestButton() {
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const send = async () => {
    const response = await fetch("/api/whatsapp/test", { method: "POST" });
    const result = await response.json().catch(() => null);
    setNotice(response.ok && result?.success ? { type: "success", message: "Kirim Test WhatsApp berhasil dicatat." } : { type: "error", message: result?.message || "Test WhatsApp gagal." });
  };
  return <div className="mt-4">{notice && <Toast {...notice} />}<Button type="button" onClick={send}>Kirim Test WhatsApp</Button></div>;
}
