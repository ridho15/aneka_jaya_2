"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

export function ApprovalActionForm({ id }: { id: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const executeSubmit = async (action: "approve" | "reject") => {
    if (action === "reject" && !reason.trim()) {
      showToast("Alasan reject wajib diisi.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/approval/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        showToast(result?.message || "Approval gagal diproses.", "error");
        return;
      }

      setConfirmAction(null);
      showToast(
        action === "approve"
          ? "Transaksi berhasil disetujui (Approve)."
          : "Transaksi berhasil ditolak (Reject).",
        "success"
      );
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan saat memproses approval.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-5 space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        <span className="mb-1 block font-semibold">Alasan Reject (Wajib jika menolak)</span>
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Tuliskan alasan penolakan jika ingin menolak transaksi ini..."
        />
      </label>

      <div className="flex gap-3">
        <Button
          type="button"
          onClick={() => setConfirmAction("approve")}
          disabled={isSubmitting}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmAction("reject")}
          disabled={isSubmitting}
          className="hover:border-rose-300 hover:text-rose-700"
        >
          Reject
        </Button>
      </div>

      {/* Approve Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmAction === "approve"}
        title="Setujui (Approve) Transaksi"
        message="Apakah Anda yakin ingin menyetujui transaksi ini? Status pengeluaran akan otomatis disetujui."
        confirmLabel="Ya, Setujui"
        cancelLabel="Batal"
        variant="primary"
        isLoading={isSubmitting}
        onConfirm={() => executeSubmit("approve")}
        onCancel={() => {
          if (!isSubmitting) setConfirmAction(null);
        }}
      />

      {/* Reject Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmAction === "reject"}
        title="Tolak (Reject) Transaksi"
        description={
          <div className="space-y-1 text-sm text-slate-600">
            <p>Apakah Anda yakin ingin menolak transaksi ini? Mohon pastikan alasan penolakan sudah terisi dengan benar.</p>
          </div>
        }
        confirmLabel="Ya, Tolak"
        cancelLabel="Batal"
        variant="danger"
        isLoading={isSubmitting}
        confirmDisabled={!reason.trim()}
        onConfirm={() => executeSubmit("reject")}
        onCancel={() => {
          if (!isSubmitting) setConfirmAction(null);
        }}
      >
        <div className="space-y-1 pt-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Alasan Reject <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            rows={2}
            placeholder="Alasan penolakan..."
            className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>
      </ConfirmationModal>
    </div>
  );
}
