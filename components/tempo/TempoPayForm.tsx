"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import type { RekeningAccount } from "@/lib/business/masterData";

type Props = { tempoId: string; remainingAmount: number; tipeId?: string; rekenings: RekeningAccount[] };

export function TempoPayForm({ tempoId, remainingAmount, tipeId, rekenings }: Props) {
  const router = useRouter();
  const filteredRekenings = tipeId ? rekenings.filter((r) => r.tipeIds.includes(tipeId)) : rekenings;
  const availableRekenings = filteredRekenings.length > 0 ? filteredRekenings : rekenings;
  const [selectedRekeningId, setSelectedRekeningId] = useState(availableRekenings[0]?.id || "");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [amountPaid, setAmountPaid] = useState(remainingAmount);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rekeningName = availableRekenings.find((r) => r.id === selectedRekeningId)?.name || selectedRekeningId;
    const payload = { ...Object.fromEntries(form.entries()), rekeningId: selectedRekeningId, rekeningNameSnapshot: rekeningName };
    const response = await fetch(`/api/tempo/${tempoId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) { setNotice({ type: "error", message: result?.message || "Tempo gagal dibayar." }); return; }
    setNotice({ type: "success", message: "Tempo berhasil dibayar." });
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="aj-surface space-y-4 p-6">
      {notice && <Toast {...notice} />}
      <h3 className="text-lg font-bold">Pembayaran Tempo</h3>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">Tanggal dibayar</span>
        <Input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">Nominal dibayar</span>
        <Input name="amountPaid" type="number" min="1" max={remainingAmount} value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} required />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">Metode pembayaran</span>
        <Select name="paymentMethod" required><option>Cash</option><option>TF</option><option>Other</option></Select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">Rekening penerima</span>
        <Select name="rekeningId" value={selectedRekeningId} onChange={(e) => setSelectedRekeningId(e.target.value)} required>
          {availableRekenings.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          {availableRekenings.length === 0 && <option value="">— tidak ada rekening —</option>}
        </Select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block">Catatan</span>
        <Textarea name="notes" rows={2} />
      </label>
      <Button type="submit" className="w-full">Mark Paid / Partial Paid</Button>
    </form>
  );
}
