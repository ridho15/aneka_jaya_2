"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { RekeningAccount } from "@/lib/business/masterData";
import { jakartaDateKey } from "@/lib/date/jakarta";

type Props = {
  tempoId: string;
  remainingAmount: number;
  tipeId?: string;
  rekenings: RekeningAccount[];
};

export function TempoPayForm({ tempoId, remainingAmount, tipeId, rekenings }: Props) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "TF" | "Other">("TF");
  const [paymentDate, setPaymentDate] = useState(jakartaDateKey());
  const [amountPaid, setAmountPaid] = useState<number>(remainingAmount);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  // Filter accounts for this bookkeeping type
  const baseRekenings = useMemo(() => {
    return tipeId ? rekenings.filter((r) => r.tipeIds.includes(tipeId)) : rekenings;
  }, [rekenings, tipeId]);

  const availableForTipe = useMemo(() => {
    return baseRekenings.length > 0 ? baseRekenings : rekenings;
  }, [baseRekenings, rekenings]);

  // Method-specific filter: Cash vs Bank Transfer vs All
  const isCashRekening = (r: RekeningAccount) => Boolean(r.isCash || r.bank?.toLowerCase() === "cash" || r.id.startsWith("cash"));

  const availableRekenings = useMemo(() => {
    const methodRekenings = availableForTipe.filter((r) => {
      if (paymentMethod === "Cash") return isCashRekening(r);
      if (paymentMethod === "TF") return !isCashRekening(r);
      return true;
    });
    return methodRekenings.length > 0 ? methodRekenings : availableForTipe;
  }, [availableForTipe, paymentMethod]);

  const [selectedRekeningId, setSelectedRekeningId] = useState(availableRekenings[0]?.id || "");

  // Auto-switch selected account when payment method changes
  useEffect(() => {
    if (!availableRekenings.some((r) => r.id === selectedRekeningId)) {
      if (availableRekenings.length > 0) {
        setSelectedRekeningId(availableRekenings[0].id);
      }
    }
  }, [availableRekenings, selectedRekeningId]);

  const rupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amountPaid || amountPaid <= 0) {
      setNotice({ type: "error", message: "Nominal pembayaran harus lebih dari 0." });
      return;
    }
    if (amountPaid > remainingAmount) {
      setNotice({ type: "error", message: `Nominal tidak boleh melebihi sisa tagihan (${rupiah(remainingAmount)}).` });
      return;
    }

    setIsSubmitting(true);
    setNotice(undefined);

    const rekeningName = availableRekenings.find((r) => r.id === selectedRekeningId)?.name || selectedRekeningId;
    const payload = {
      paymentDate,
      amountPaid,
      paymentMethod,
      rekeningId: selectedRekeningId,
      rekeningNameSnapshot: rekeningName,
      notes: notes.trim() || undefined
    };

    try {
      const response = await fetch(`/api/tempo/${tempoId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setNotice({ type: "error", message: result?.message || "Pembayaran tempo gagal diproses." });
        setIsSubmitting(false);
        return;
      }

      setNotice({ type: "success", message: "Pembayaran tempo berhasil dicatat!" });
      router.refresh();
    } catch {
      setNotice({ type: "error", message: "Terjadi kesalahan jaringan saat memproses pembayaran." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFullPayment = amountPaid === remainingAmount;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-emerald-100 bg-linear-to-b from-white to-emerald-50/30 p-5 shadow-xs sm:p-6">
      {notice && <div className="mb-4"><Toast {...notice} /></div>}

      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">💳 Form Pembayaran Tempo</h3>
          <p className="text-xs text-slate-500">Catat penerimaan cicilan atau pelunasan sisa tagihan</p>
        </div>
        {isFullPayment ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            Pelunasan Penuh
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            Cicilan / Sebagian
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Tanggal Bayar */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Tanggal Pembayaran
          </label>
          <Input
            name="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            className="w-full rounded-xl border-slate-200 bg-white"
          />
        </div>

        {/* Nominal Dibayar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Nominal Dibayar (Rp)
            </label>
            <span className="text-xs text-slate-500 font-medium">
              Sisa: <b className="text-slate-900">{rupiah(remainingAmount)}</b>
            </span>
          </div>
          <MoneyInput
            value={amountPaid}
            onValueChange={(val) => setAmountPaid(val)}
            placeholder="0"
            required
            className="w-full text-base font-bold rounded-xl border-slate-200 bg-white text-slate-900"
          />
          {/* Quick Pay Buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAmountPaid(remainingAmount)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                amountPaid === remainingAmount
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              ⚡ Lunas ({rupiah(remainingAmount)})
            </button>
            {remainingAmount >= 20000 && (
              <button
                type="button"
                onClick={() => setAmountPaid(Math.floor(remainingAmount / 2))}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                50% ({rupiah(Math.floor(remainingAmount / 2))})
              </button>
            )}
          </div>
        </div>

        {/* Metode Pembayaran */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Metode Pembayaran
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["TF", "Cash", "Other"] as const).map((method) => {
              const active = paymentMethod === method;
              const icons = { TF: "🏦", Cash: "💵", Other: "⚙️" };
              const labels = { TF: "Transfer (TF)", Cash: "Tunai (Cash)", Other: "Lainnya" };
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-center transition-all cursor-pointer ${
                    active
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base mb-0.5">{icons[method]}</span>
                  <span className="text-xs">{labels[method]}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
        </div>

        {/* Rekening Penerima */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Rekening Penerima {paymentMethod === "Cash" ? "(Kas Tunai)" : paymentMethod === "TF" ? "(Rekening Bank)" : ""}
            </label>
            <span className="text-xs text-slate-400">
              {availableRekenings.length} akun tersedia
            </span>
          </div>
          <Select
            name="rekeningId"
            value={selectedRekeningId}
            onChange={(e) => setSelectedRekeningId(e.target.value)}
            required
            className="w-full rounded-xl border-slate-200 bg-white text-sm font-medium"
          >
            {availableRekenings.map((r) => {
              const isCash = isCashRekening(r);
              const label = isCash
                ? `💵 ${r.name}`
                : `🏦 ${r.bank ? `[${r.bank}] ` : ""}${r.name}${r.accountNumber && r.accountNumber !== "-" ? ` • ${r.accountNumber}` : ""}`;
              return (
                <option key={r.id} value={r.id}>
                  {label}
                </option>
              );
            })}
            {availableRekenings.length === 0 && <option value="">— tidak ada rekening aktif —</option>}
          </Select>
        </div>

        {/* Catatan */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Catatan Pembayaran <span className="font-normal text-slate-400">(Opsional)</span>
          </label>
          <Textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Bukti transfer via BCA an. Toko"
            className="w-full rounded-xl border-slate-200 bg-white text-sm"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || amountPaid <= 0 || amountPaid > remainingAmount}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 px-4 text-sm font-bold text-white shadow-xs hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Memproses Pembayaran...</span>
            </>
          ) : (
            <span>💰 Simpan Pembayaran {amountPaid > 0 ? `(${rupiah(amountPaid)})` : ""}</span>
          )}
        </button>
      </div>
    </form>
  );
}
