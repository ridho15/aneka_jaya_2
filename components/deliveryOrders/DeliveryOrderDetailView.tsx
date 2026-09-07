"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";

type Officer = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
};

type Props = {
  initialDetail: DeliveryOrderData;
  officers: Officer[];
  canAssign: boolean;
  canProcess: boolean;
  currentUserRole: string;
};

export function DeliveryOrderDetailView({
  initialDetail,
  officers,
  canAssign,
  canProcess
}: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<DeliveryOrderData>(initialDetail);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() =>
    initialDetail.items.map((i) => i.id)
  );
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string>(
    initialDetail.receiptPhotoUrl || ""
  );
  const [trackingNumber, setTrackingNumber] = useState<string>(
    initialDetail.trackingNumber || ""
  );
  const [shippingNotes, setShippingNotes] = useState<string>(
    initialDetail.notes || ""
  );

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const allSelected = detail.items.length > 0 && selectedItemIds.length === detail.items.length;
  const someSelected = selectedItemIds.length > 0 && selectedItemIds.length < detail.items.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(detail.items.map((i) => i.id));
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatusMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setReceiptPhotoUrl(data.data.url);
        setStatusMessage({ type: "success", text: "Foto resi berhasil diunggah." });
      } else {
        setStatusMessage({
          type: "error",
          text: data.message || "Gagal mengunggah foto resi."
        });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi kesalahan koneksi saat unggah." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAssignOfficer = async (officerId: string) => {
    const officer = officers.find((o) => o.id === officerId);
    if (!officer) return;

    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: officer.id,
          assignedUserName: officer.name
        })
      });
      const data = await res.json();
      if (data.success) {
        setDetail((prev) => ({
          ...prev,
          assignedUserId: officer.id,
          assignedUserName: officer.name
        }));
        setStatusMessage({ type: "success", text: `Petugas DO ditugaskan ke ${officer.name}` });
      } else {
        setStatusMessage({ type: "error", text: data.message || "Gagal menugaskan petugas." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    }
  };

  const handleUpdatePacking = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/packing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packedItemIds: selectedItemIds })
      });
      const data = await res.json();
      if (data.success) {
        setDetail((prev) => ({ ...prev, packingStatus: "sudah" }));
        setStatusMessage({ type: "success", text: "Status packing berhasil diubah menjadi Sudah." });
        router.refresh();
      } else {
        setStatusMessage({ type: "error", text: data.message || "Gagal memperbarui packing." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShipItems = async () => {
    if (selectedItemIds.length === 0) {
      setStatusMessage({ type: "error", text: "Pilih setidaknya satu barang untuk dikirim." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippedItemIds: selectedItemIds,
          receiptPhotoUrl: receiptPhotoUrl || undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          notes: shippingNotes.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        const isFull = selectedItemIds.length >= detail.items.length;
        setDetail((prev) => ({
          ...prev,
          status: isFull ? "selesai" : "selesai_setengah",
          packingStatus: "sudah",
          shippingStatus: "sudah",
          receiptPhotoUrl,
          trackingNumber
        }));
        setStatusMessage({
          type: "success",
          text: isFull
            ? "Pengiriman selesai! Semua barang telah dikirim & status invoice Selesai."
            : "Pengiriman sebagian berhasil diproses (Status: Selesai Setengah)."
        });
        router.refresh();
      } else {
        setStatusMessage({ type: "error", text: data.message || "Gagal memproses pengiriman." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <Link
            href="/delivery-orders"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Kembali ke Antrean DO
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {detail.doNumber}
            </h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                detail.status === "selesai"
                  ? "bg-emerald-100 text-emerald-800"
                  : detail.status === "selesai_setengah"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {detail.status === "selesai"
                ? "Selesai"
                : detail.status === "selesai_setengah"
                ? "Selesai Setengah"
                : "Belum Selesai"}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            No Invoice / Transaksi: <span className="font-mono font-medium text-slate-700">{detail.sale.transactionNumber || "—"}</span> • Tanggal: {formatJakartaDate(detail.sale.saleDate)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${
              detail.packingStatus === "sudah"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Packing: {detail.packingStatus === "sudah" ? "Sudah" : "Belum"}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${
              detail.shippingStatus === "sudah"
                ? "bg-blue-100 text-blue-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Kirim: {detail.shippingStatus === "sudah" ? "Sudah" : "Belum"}
          </span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg p-3 text-sm font-medium ${
            statusMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Customer & Expedition Information Card (STRICTLY MASKED: NO PRICES) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Informasi Penerima & Pengiriman
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="block text-xs text-slate-400">Nama Customer</span>
            <span className="text-sm font-bold text-slate-900">{detail.sale.customerName}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-400">Alamat / Lokasi</span>
            <span className="text-sm text-slate-800">{detail.sale.customerLocation || "—"}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-400">Ekspedisi / Metode Kirim</span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
              ⛟ {detail.sale.shippingMethod || "Reguler / Ambil"}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400">Petugas DO</span>
            {canAssign ? (
              <select
                value={detail.assignedUserId || ""}
                onChange={(e) => handleAssignOfficer(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 bg-white"
              >
                <option value="">-- Pilih Petugas DO --</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-slate-800">
                {detail.assignedUserName || <span className="text-slate-400 italic">Belum ditugaskan</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Items Checklist Card (STRICTLY MASKED: NO PRICES, ONLY SKU, RACK, QTY, UOM) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Daftar Barang (Item DO)
            </h2>
            <p className="text-xs text-slate-500">
              Pilih item yang siap dikirim menggunakan checkbox di bawah.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              {allSelected ? "Batal Pilih Semua" : "Pilih Semua Barang"}
            </button>
            <span className="text-xs font-medium text-slate-500">
              ({selectedItemIds.length} dari {detail.items.length} dipilih)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-white text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="px-4 py-3">Produk & SKU</th>
                <th className="px-4 py-3">Lokasi / Rak Gudang</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-center">Satuan</th>
                <th className="px-4 py-3 text-center">Status Kirim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.items.map((item) => {
                const isChecked = selectedItemIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isChecked ? "bg-emerald-50/50" : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{item.productNameSnapshot}</div>
                      <div className="mt-0.5 text-xs text-slate-500">SKU: {item.productRef}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        📍 {item.rackNameSnapshot || item.warehouseNameSnapshot || "Gudang Utama"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-medium text-slate-600">
                      {item.unitSnapshot || "Pcs"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.isShipped ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Terkirim
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                          Belum Kirim
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proof of Delivery (Foto Resi) & Shipping Information */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Bukti Pengiriman (Foto Resi) & Catatan
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* File upload */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Upload Foto Resi / Bukti Kirim
            </label>
            <input
              type="file"
              accept="image/*"
              disabled={isUploading || isSubmitting}
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
            />
            {isUploading && <p className="mt-1 text-xs text-emerald-600">Mengunggah foto resi...</p>}
            {receiptPhotoUrl && (
              <div className="mt-3">
                <span className="block text-xs text-slate-400 mb-1">Preview Foto Resi:</span>
                <a href={receiptPhotoUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptPhotoUrl}
                    alt="Foto Resi"
                    className="h-32 w-auto max-w-full rounded-lg border border-slate-200 object-cover shadow-xs hover:opacity-90 transition-opacity"
                  />
                </a>
              </div>
            )}
          </div>

          {/* Tracking number & notes */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Nomor Resi / Pelacakan (Opsional)
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Contoh: JNE-987654321..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Catatan Pengiriman (Opsional)
              </label>
              <textarea
                value={shippingNotes}
                rows={2}
                onChange={(e) => setShippingNotes(e.target.value)}
                placeholder="Catatan tambahan untuk ekspedisi / penerima..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      {canProcess && (
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleUpdatePacking}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none disabled:opacity-50"
          >
            Tandai Packing Selesai
          </button>

          <button
            type="button"
            disabled={isSubmitting || selectedItemIds.length === 0}
            onClick={handleShipItems}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 focus:outline-none disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              "Memproses..."
            ) : selectedItemIds.length >= detail.items.length ? (
              "✓ Kirim Semua Barang (Status Selesai)"
            ) : (
              `✓ Kirim ${selectedItemIds.length} Barang (Status Selesai Setengah)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
