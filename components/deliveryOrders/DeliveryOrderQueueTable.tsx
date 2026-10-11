"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeliveryOrderQueueItem } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";
import { useToast } from "@/components/ui/ToastProvider";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { parseReceiptPhotos } from "@/lib/deliveryOrders/photos";

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
  currentUserName?: string;
};

export function DeliveryOrderQueueTable({
  initialQueue,
  officers,
  canAssign,
  canProcess,
  currentUserRole,
  currentUserName
}: Props) {
  const { showToast } = useToast();
  const [queue, setQueue] = useState<DeliveryOrderQueueItem[]>(initialQueue);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const isOwner = currentUserRole === "OWNER";

  const handleAssign = async (doId: string, officerId: string) => {
    const officer = officers.find((o) => o.id === officerId);
    if (!officer) return;

    setAssigningId(doId);
    try {
      const res = await fetch(`/api/delivery-orders/${doId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          assignedUserId: officer.id,
          assignedUserName: officer.name
        })
      });
      const data = await res.json();
      if (data.success) {
        setQueue((prev) =>
          prev.map((item) => {
            if (item.id !== doId) return item;
            const existing =
              item.assignedOfficers && item.assignedOfficers.length > 0
                ? item.assignedOfficers
                : item.assignedUserId
                ? [
                    {
                      id: `legacy-${item.assignedUserId}`,
                      userId: item.assignedUserId,
                      userName: item.assignedUserName || item.assignedUserId,
                      assignedAt: new Date().toISOString()
                    }
                  ]
                : [];
            const alreadyAssigned = existing.some((ao) => ao.userId === officer.id);
            const nextOfficers = alreadyAssigned
              ? existing
              : [
                  ...existing,
                  {
                    id: `new-${officer.id}`,
                    userId: officer.id,
                    userName: officer.name,
                    assignedAt: new Date().toISOString()
                  }
                ];
            return {
              ...item,
              assignedUserId: item.assignedUserId || officer.id,
              assignedUserName: item.assignedUserName || officer.name,
              assignedOfficers: nextOfficers
            };
          })
        );
        showToast({
          type: "success",
          message: `Petugas DO ${officer.name} berhasil ditugaskan.`
        });
      } else {
        showToast({
          type: "error",
          message: data.message || "Gagal menambahkan Petugas DO."
        });
      }
    } catch {
      showToast({
        type: "error",
        message: "Terjadi kesalahan jaringan saat menugaskan Petugas DO."
      });
    } finally {
      setAssigningId(null);
    }
  };

  const getStatusBadge = (status: DeliveryOrderQueueItem["status"]) => {
    if (status === "selesai") {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-sm">
          Selesai
        </span>
      );
    }
    if (status === "selesai_setengah") {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200 shadow-sm">
          Selesai Sebagian
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200 shadow-sm">
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
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                {isOwner && (
                  <div className="font-bold text-slate-900">{item.doNumber}</div>
                )}
                <div
                  className={`${
                    isOwner ? "text-xs text-slate-500" : "font-bold text-slate-900 text-sm"
                  }`}
                >
                  Inv: {item.transactionNumber || "—"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatJakartaDate(item.saleDate)}
                </div>
              </div>
              <div>{getStatusBadge(item.status)}</div>
            </div>

            <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5">
              <div className="font-semibold text-slate-900 text-sm">{item.customerName}</div>
              <div className="text-slate-600 break-words leading-relaxed flex items-start gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{item.customerLocation || "Lokasi: —"}</span>
              </div>
              <div className="text-slate-700 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8h4.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a2 2 0 104 0m-10 0a2 2 0 104 0" />
                </svg>
                <span>Ekspedisi: {item.shippingMethod || "Reguler / Ambil"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    item.packingStatus === "sudah"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Packing: {item.packingStatus === "sudah" ? "Sudah" : "Belum"}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    item.shippingStatus === "sudah"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Kirim: {item.shippingStatus === "sudah" ? "Sudah" : "Belum"}
                </span>
              </div>
              <div className="text-slate-500 font-medium">
                {item.shippedItemsCount} / {item.totalItemsCount} item
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-700">Petugas:</span>
                {item.assignedOfficers && item.assignedOfficers.length > 0 ? (
                  item.assignedOfficers.map((ao) => (
                    <span
                      key={ao.userId}
                      className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200"
                    >
                      <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>{ao.userName}</span>
                    </span>
                  ))
                ) : item.assignedUserName ? (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                    <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>{item.assignedUserName}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 italic">Belum ditugaskan</span>
                )}
              </div>
              {(canAssign || currentUserRole === "DELIVERY_DRIVER") && (
                <div className="w-full">
                  <SearchableSelect
                    placeholder={
                      assigningId === item.id
                        ? "Menugaskan..."
                        : `+ ${currentUserRole === "DELIVERY_DRIVER" ? "Ajak Petugas DO" : "Tambah Petugas DO"}`
                    }
                    searchPlaceholder="Cari nama petugas..."
                    disabled={assigningId === item.id}
                    isLoading={assigningId === item.id}
                    options={officers
                      .filter(
                        (o) =>
                          !item.assignedOfficers?.some((ao) => ao.userId === o.id) &&
                          item.assignedUserId !== o.id
                      )
                      .map((o) => ({
                        value: o.id,
                        label: o.name,
                        badge: o.role === "DELIVERY_DRIVER" ? "Petugas DO" : o.role
                      }))}
                    onSelect={(officerId) => handleAssign(item.id, officerId)}
                    align="left"
                    buttonClassName="w-full text-xs py-1.5 px-2.5 border-slate-200 hover:border-slate-300"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/delivery-orders/${item.id}/print${currentUserName ? `?userName=${encodeURIComponent(currentUserName)}` : ""}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                  title="Cetak DO Thermal 80mm"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Cetak</span>
                </Link>
                <Link
                  href={`/delivery-orders/${item.id}`}
                  className="flex-1 text-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  {canProcess && item.status !== "selesai" ? "Proses DO" : "Lihat DO"}
                </Link>
              </div>
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
              <th className="px-5 py-3.5">{isOwner ? "No DO / Invoice" : "No. Invoice"}</th>
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
                <td className="px-5 py-3.5 whitespace-nowrap">
                  {isOwner && <div className="font-bold text-slate-900">{item.doNumber}</div>}
                  <div
                    className={`font-mono text-xs ${
                      isOwner ? "text-slate-500 mt-0.5" : "font-bold text-slate-900 text-sm"
                    }`}
                  >
                    Inv: {item.transactionNumber || "—"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatJakartaDate(item.saleDate)}
                  </div>
                </td>
                <td className="px-5 py-3.5 max-w-xs">
                  <div className="font-semibold text-slate-900">{item.customerName}</div>
                  <div
                    className="mt-1 text-xs text-slate-600 break-words leading-relaxed flex items-start gap-1.5"
                    title={item.customerLocation}
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{item.customerLocation || <span className="text-slate-400 italic">Alamat: —</span>}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8h4.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a2 2 0 104 0m-10 0a2 2 0 104 0" />
                    </svg>
                    <span>{item.shippingMethod || "Reguler / Ambil"}</span>
                  </div>
                  {item.deliveryAt && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Jadwal: {formatJakartaDate(item.deliveryAt)}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="space-y-1.5 min-w-[180px]">
                    <div className="flex flex-wrap gap-1">
                      {item.assignedOfficers && item.assignedOfficers.length > 0 ? (
                        item.assignedOfficers.map((ao) => (
                          <span
                            key={ao.userId}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200"
                          >
                            <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span>{ao.userName}</span>
                          </span>
                        ))
                      ) : item.assignedUserName ? (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                          <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>{item.assignedUserName}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Belum ditugaskan</span>
                      )}
                    </div>
                    {(canAssign || currentUserRole === "DELIVERY_DRIVER") && (
                      <div className="mt-1">
                        <SearchableSelect
                          placeholder={
                            assigningId === item.id
                              ? "Menugaskan..."
                              : `+ ${currentUserRole === "DELIVERY_DRIVER" ? "Ajak Petugas DO" : "Tambah Petugas DO"}`
                          }
                          searchPlaceholder="Cari nama petugas..."
                          disabled={assigningId === item.id}
                          isLoading={assigningId === item.id}
                          options={officers
                            .filter(
                              (o) =>
                                !item.assignedOfficers?.some((ao) => ao.userId === o.id) &&
                                item.assignedUserId !== o.id
                            )
                            .map((o) => ({
                              value: o.id,
                              label: o.name,
                              badge: o.role === "DELIVERY_DRIVER" ? "Petugas DO" : o.role
                            }))}
                          onSelect={(officerId) => handleAssign(item.id, officerId)}
                          align="left"
                          buttonClassName="w-full text-[11px] py-1 px-2 border-slate-200 hover:border-slate-300"
                        />
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-center whitespace-nowrap">
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
                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.shippingStatus === "sudah"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.shippingStatus === "sudah" ? "Sudah" : "Belum"}
                  </span>
                  {item.receiptPhotoUrl && (() => {
                    const photos = parseReceiptPhotos(item.receiptPhotoUrl);
                    if (photos.length === 0) return null;
                    return (
                      <div className="mt-1">
                        <a
                          href={photos[0]}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 hover:underline"
                          title={photos.length > 1 ? `${photos.length} foto bukti pengiriman tersimpan (klik untuk melihat foto pertama)` : "Lihat foto resi"}
                        >
                          <svg className="w-3 h-3 text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{photos.length > 1 ? `Foto Resi (${photos.length})` : "Foto Resi"}</span>
                        </a>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                  {getStatusBadge(item.status)}
                  <div className="mt-1 text-[11px] text-slate-500">
                    {item.shippedItemsCount} / {item.totalItemsCount} item
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/delivery-orders/${item.id}/print${currentUserName ? `?userName=${encodeURIComponent(currentUserName)}` : ""}`}
                      target="_blank"
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                      title="Cetak DO Thermal 80mm"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      <span>Cetak</span>
                    </Link>
                    <Link
                      href={`/delivery-orders/${item.id}`}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      {canProcess && item.status !== "selesai" ? "Proses DO" : "Lihat DO"}
                    </Link>
                  </div>
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
