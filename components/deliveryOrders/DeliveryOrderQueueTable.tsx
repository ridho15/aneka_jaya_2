"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeliveryOrderQueueItem } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";

type Officer = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
};

type Props = {
  initialQueue: DeliveryOrderQueueItem[];
  officers: Officer[];
  canAssign: boolean;
  canProcess: boolean;
  currentUserId: string;
  currentUserRole: string;
};

export function DeliveryOrderQueueTable({
  initialQueue,
  officers,
  canAssign,
  canProcess,
}: Props) {
  const [queue, setQueue] = useState<DeliveryOrderQueueItem[]>(initialQueue);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const handleAssign = async (doId: string, officerId: string) => {
    const officer = officers.find((o) => o.id === officerId);
    if (!officer) return;

    setAssigningId(doId);
    try {
      const res = await fetch(`/api/delivery-orders/${doId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: officer.id,
          assignedUserName: officer.name
        })
      });
      const data = await res.json();
      if (data.success) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === doId
              ? { ...item, assignedUserId: officer.id, assignedUserName: officer.name }
              : item
          )
        );
      } else {
        alert(data.message || "Gagal menugaskan Petugas DO.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setAssigningId(null);
    }
  };

  const getStatusBadge = (status: DeliveryOrderQueueItem["status"]) => {
    if (status === "selesai") {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-xs">
          Selesai
        </span>
      );
    }
    if (status === "selesai_setengah") {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200 shadow-xs">
          Selesai Sebagian
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200 shadow-xs">
        Belum Selesai
      </span>
    );
  };

  return (
    <>
      {/* Mobile Card View */}
      <div className="space-y-3 p-4 md:hidden">
        {queue.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900">{item.doNumber}</div>
                <div className="text-xs text-slate-500">
                  Inv: {item.transactionNumber || "—"} • {formatJakartaDate(item.saleDate)}
                </div>
              </div>
              <div>{getStatusBadge(item.status)}</div>
            </div>

            <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1">
              <div className="font-semibold text-slate-900">{item.customerName}</div>
              <div className="text-slate-600">{item.customerLocation || "Lokasi: —"}</div>
              <div className="text-slate-500">Ekspedisi: {item.shippingMethod || "Reguler / Ambil"}</div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    item.packingStatus === "sudah" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Packing: {item.packingStatus === "sudah" ? "Sudah" : "Belum"}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    item.shippingStatus === "sudah" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Kirim: {item.shippingStatus === "sudah" ? "Sudah" : "Belum"}
                </span>
              </div>
              <div className="text-slate-500 font-medium">
                {item.shippedItemsCount} / {item.totalItemsCount} item
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600 truncate">
                Petugas: <span className="font-semibold">{item.assignedUserName || "Belum"}</span>
              </div>
              <Link
                href={`/delivery-orders/${item.id}`}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                {canProcess && item.status !== "selesai" ? "Proses DO" : "Lihat DO"}
              </Link>
            </div>
          </div>
        ))}

        {queue.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
            Tidak ada Delivery Order yang sesuai filter pencarian.
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3.5">No DO / Invoice</th>
              <th className="px-5 py-3.5">Customer &amp; Alamat</th>
              <th className="px-5 py-3.5">Ekspedisi / Jadwal</th>
              <th className="px-5 py-3.5">Petugas DO</th>
              <th className="px-5 py-3.5 text-center">Packing</th>
              <th className="px-5 py-3.5 text-center">Kirim</th>
              <th className="px-5 py-3.5 text-center">Status DO</th>
              <th className="px-5 py-3.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {queue.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-bold text-slate-900">{item.doNumber}</div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">
                    Inv: {item.transactionNumber || "—"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatJakartaDate(item.saleDate)}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-slate-900">{item.customerName}</div>
                  <div className="mt-0.5 text-xs text-slate-500 max-w-xs truncate" title={item.customerLocation}>
                    {item.customerLocation || "—"}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    ⛟ {item.shippingMethod || "Reguler / Ambil"}
                  </div>
                  {item.deliveryAt && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Kirim: {formatJakartaDate(item.deliveryAt)}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {canAssign ? (
                    <select
                      value={item.assignedUserId || ""}
                      disabled={assigningId === item.id}
                      onChange={(e) => handleAssign(item.id, e.target.value)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Pilih Petugas DO --</option>
                      {officers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.role === "DELIVERY_DRIVER" ? "Petugas DO" : o.role})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-medium text-slate-700">
                      {item.assignedUserName || <span className="text-slate-400 italic">Belum ditugaskan</span>}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.packingStatus === "sudah"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.packingStatus === "sudah" ? "Sudah" : "Belum"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.shippingStatus === "sudah"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.shippingStatus === "sudah" ? "Sudah" : "Belum"}
                  </span>
                  {item.receiptPhotoUrl && (
                    <div className="mt-1">
                      <a
                        href={item.receiptPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-700 hover:underline"
                      >
                        📷 Foto Resi
                      </a>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  {getStatusBadge(item.status)}
                  <div className="mt-1 text-[11px] text-slate-500">
                    {item.shippedItemsCount} / {item.totalItemsCount} item
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/delivery-orders/${item.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                  >
                    {canProcess && item.status !== "selesai" ? "Proses DO" : "Lihat DO"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            Tidak ada Delivery Order yang sesuai filter pencarian.
          </div>
        )}
      </div>
    </>
  );
}
