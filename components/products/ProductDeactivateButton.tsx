"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";

export function ProductDeactivateButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirmDeactivate = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        showToast(result?.message || "Barang gagal dinonaktifkan.", "error");
        return;
      }
      showToast("Barang berhasil dinonaktifkan dari katalog.", "success");
      setIsConfirmOpen(false);
      router.refresh();
    } catch {
      showToast("Terjadi kesalahan jaringan saat menonaktifkan barang.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsConfirmOpen(true)}
        disabled={disabled || busy}
        className="font-semibold text-rose-600 hover:text-rose-800 disabled:cursor-not-allowed disabled:text-slate-400 transition-colors"
      >
        {busy ? "Memproses..." : "Nonaktifkan"}
      </button>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        title="Nonaktifkan Barang"
        message="Nonaktifkan barang ini di sistem ERP? Data riwayat transaksi tidak akan terhapus, namun barang tidak lagi muncul di daftar aktif."
        confirmText="Ya, Nonaktifkan"
        cancelText="Batal"
        variant="danger"
        isLoading={busy}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => {
          if (!busy) setIsConfirmOpen(false);
        }}
      />
    </>
  );
}
