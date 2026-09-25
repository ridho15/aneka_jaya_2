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

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {deliveryOrder ? (
        <>
          <Link
            href={`/delivery-orders/${deliveryOrder.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-800 hover:bg-sky-100 shadow-xs transition-colors"
            title="Buka detail Surat Jalan (DO)"
          >
            <span>📦</span>
            <span>Surat Jalan ({deliveryOrder.doNumber})</span>
            {deliveryOrder.itemCount === 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 animate-pulse">
                0 item!
              </span>
            ) : (
              <span className="rounded-full bg-sky-200/70 px-2 py-0.5 text-xs font-medium text-sky-900">
                {deliveryOrder.itemCount} item
              </span>
            )}
          </Link>

          {!isCancelled && (
            <button
              type="button"
              onClick={handleSync}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 shadow-xs transition-colors disabled:opacity-50"
              title="Sinkronkan ulang item Surat Jalan dengan transaksi ini"
            >
              <span className={busy ? "animate-spin" : ""}>🔄</span>
              <span>{busy ? "Menyinkronkan..." : "Sinkronkan DO"}</span>
            </button>
          )}
        </>
      ) : (
        !isCancelled && (
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 shadow-xs transition-colors disabled:opacity-50"
            title="Buat Surat Jalan (DO) dan sinkronkan item dari transaksi ini"
          >
            <span className={busy ? "animate-spin" : ""}>🔄</span>
            <span>{busy ? "Membuat DO..." : "Buat / Sinkronkan DO"}</span>
          </button>
        )
      )}
    </div>
  );
}
