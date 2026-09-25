"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";

interface DeliveryOrderSummary {
  id: string;
  doNumber: string;
  packingStatus: string;
  shippingStatus: string;
  itemCount: number;
}

interface DeliveryOrderSyncButtonProps {
  salesRecordId: string;
  deliveryOrder: DeliveryOrderSummary | null;
  approvalStatus?: string;
  className?: string;
}

export function DeliveryOrderSyncButton({
  salesRecordId,
  deliveryOrder,
  approvalStatus,
  className = ""
}: DeliveryOrderSyncButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleSync = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const res = await fetch("/api/delivery-orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesRecordId })
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        showToast(data.message || "Surat Jalan (DO) berhasil disinkronkan dengan transaksi ini.", "success");
        router.refresh();
      } else {
        showToast(data?.message || "Gagal menyinkronkan Surat Jalan (DO).", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menyinkronkan DO.", "error");
    } finally {
      setBusy(false);
    }
  };

  const isCancelled = approvalStatus === "cancelled";

  if (!deliveryOrder) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs text-slate-400 italic">Belum dibuat</span>
        {!isCancelled && (
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Buat Surat Jalan (DO) dan sinkronkan item dari transaksi ini"
          >
            {busy ? "Membuat..." : "Buat DO"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Link
        href={`/delivery-orders/${deliveryOrder.id}`}
        className="font-mono text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
        title="Lihat detail Surat Jalan (DO)"
      >
        {deliveryOrder.doNumber}
      </Link>
      <span className="text-xs text-slate-500">
        ({deliveryOrder.itemCount} item • Packing: {deliveryOrder.packingStatus})
      </span>
      {deliveryOrder.itemCount === 0 && (
        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
          Item Kosong
        </span>
      )}
      {!isCancelled && (
        <button
          type="button"
          onClick={handleSync}
          disabled={busy}
          className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          title="Sinkronkan ulang item Surat Jalan dengan transaksi ini"
        >
          {busy ? "Menyinkronkan..." : "Sinkronkan"}
        </button>
      )}
    </div>
  );
}
