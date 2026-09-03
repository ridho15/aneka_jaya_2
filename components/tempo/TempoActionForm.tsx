"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

type Props = { tempoId: string; action: "cancel" | "write-off" };

export function TempoActionForm({ tempoId, action }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();

  const isCancel = action === "cancel";
  const title = isCancel ? "Batalkan Tagihan Tempo" : "Hapus Tagihan (Write-off)";
  const description = isCancel
    ? "Membatalkan seluruh sisa piutang tempo ini."
    : "Menghapus sisa tagihan piutang yang tidak tertagih (Bad Debt).";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setNotice({ type: "error", message: "Alasan minimal 5 karakter." });
      return;
    }

    setIsSubmitting(true);
    setNotice(undefined);

    try {
      const response = await fetch(`/api/tempo/${tempoId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setNotice({ type: "error", message: result?.message || `Aksi ${title} gagal.` });
        setIsSubmitting(false);
        return;
      }

      setNotice({ type: "success", message: `${title} berhasil.` });
      router.refresh();
    } catch {
      setNotice({ type: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`w-full rounded-xl border p-3 text-center text-xs font-bold transition-all cursor-pointer ${
          isCancel
            ? "border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
        }`}
      >
        {isCancel ? "Batalkan Tagihan Tempo..." : "Hapus Tagihan (Write-off)..."}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
      {notice && <Toast {...notice} />}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          ✕ Tutup
        </button>
      </div>
      <p className="text-xs text-slate-500">{description}</p>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
          Alasan Tindakan <span className="text-rose-500">*</span>
        </label>
        <Textarea
          name="reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Wajib mengisi alasan minimal 5 karakter..."
          required
          minLength={5}
          className="w-full rounded-xl border-slate-200 bg-white text-xs"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={isSubmitting || reason.trim().length < 5}
          className={`flex-1 rounded-xl py-2 text-xs font-bold text-white transition-all disabled:opacity-50 cursor-pointer ${
            isCancel ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {isSubmitting ? "Memproses..." : `Konfirmasi ${isCancel ? "Cancel" : "Write-off"}`}
        </button>
      </div>
    </form>
  );
}
