"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

export function ApprovalActionForm({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const submit = async (action: "approve" | "reject") => {
    const response = await fetch(`/api/approval/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) { setNotice({ type: "error", message: result?.message || "Approval gagal diproses." }); return; }
    setNotice({ type: "success", message: action === "approve" ? "Berhasil diapprove." : "Berhasil direject." });
    router.refresh();
  };
  return <div className="mt-6 border-t border-slate-200 pt-5">{notice && <Toast {...notice} />}<label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Alasan Reject</span><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Wajib diisi jika reject" /></label><div className="mt-4 flex gap-3"><Button type="button" onClick={() => submit("approve")}>Approve</Button><Button type="button" variant="secondary" onClick={() => submit("reject")}>Reject</Button></div></div>;
}
