"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";
import { parseReceiptPhotos } from "@/lib/deliveryOrders/photos";

import { useToast } from "@/components/ui/ToastProvider";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { DeliveryOrderProofUploader } from "./DeliveryOrderProofUploader";

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
  currentUserName?: string;
};

export function DeliveryOrderDetailView({
  initialDetail,
  officers,
  canAssign,
  canProcess,
  currentUserRole,
  currentUserName
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<DeliveryOrderData>(initialDetail);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
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
  const [isSavingPhotos, setIsSavingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [officerToRemove, setOfficerToRemove] = useState<{ id: string; name: string } | null>(null);
  const [isRemovingOfficer, setIsRemovingOfficer] = useState(false);
  const [isShipConfirmOpen, setIsShipConfirmOpen] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const photoSectionRef = useRef<HTMLDivElement>(null);

  const isOwner = currentUserRole === "OWNER";
  const canInvite = canAssign || currentUserRole === "DELIVERY_DRIVER";

  const handleSyncItems = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDetail((prev) => ({
          ...prev,
          ...data.data,
          items: data.data.items || []
        }));
        showToast(data.message || "Item DO berhasil disinkronkan dari invoice penjualan.", "success");
        router.refresh();
      } else {
        showToast(data.message || "Gagal menyinkronkan item DO.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan koneksi saat menyinkronkan DO.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedList =
    detail.assignedOfficers && detail.assignedOfficers.length > 0
      ? detail.assignedOfficers
      : detail.assignedUserId
      ? [
          {
            id: `legacy-${detail.assignedUserId}`,
            userId: detail.assignedUserId,
            userName: detail.assignedUserName || detail.assignedUserId,
            assignedAt: detail.assignedAt || ""
          }
        ]
      : [];

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

  const handleAddOfficer = async (officerId: string) => {
    const officer = officers.find((o) => o.id === officerId);
    if (!officer) return;

    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/assign`, {
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
        setDetail((prev) => {
          const existing =
            prev.assignedOfficers && prev.assignedOfficers.length > 0
              ? prev.assignedOfficers
              : prev.assignedUserId
              ? [
                  {
                    id: `legacy-${prev.assignedUserId}`,
                    userId: prev.assignedUserId,
                    userName: prev.assignedUserName || prev.assignedUserId,
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
            ...prev,
            assignedUserId: prev.assignedUserId || officer.id,
            assignedUserName: prev.assignedUserName || officer.name,
            assignedOfficers: nextOfficers
          };
        });
        showToast(`Petugas DO ${officer.name} berhasil ditambahkan.`, "success");
        router.refresh();
      } else {
        showToast(data.message || "Gagal menambahkan petugas.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menambahkan petugas.", "error");
    }
  };

  const handleRemoveOfficer = (officerId: string) => {
    const assigned = (detail.assignedOfficers || []).find((ao) => ao.userId === officerId);
    const officer = assigned ? { name: assigned.userName } : officers.find((o) => o.id === officerId);
    setOfficerToRemove({
      id: officerId,
      name: officer?.name || "Petugas"
    });
  };

  const confirmRemoveOfficer = async () => {
    if (!officerToRemove) return;
    setIsRemovingOfficer(true);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          assignedUserId: officerToRemove.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setDetail((prev) => {
          const nextOfficers = (prev.assignedOfficers || []).filter(
            (ao) => ao.userId !== officerToRemove.id
          );
          return {
            ...prev,
            assignedUserId: nextOfficers[0]?.userId,
            assignedUserName: nextOfficers[0]?.userName,
            assignedOfficers: nextOfficers
          };
        });
        showToast(`Petugas ${officerToRemove.name} berhasil dihapus dari penugasan ini.`, "success");
        setOfficerToRemove(null);
        router.refresh();
      } else {
        showToast(data.message || "Gagal menghapus petugas.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menghapus petugas.", "error");
    } finally {
      setIsRemovingOfficer(false);
    }
  };

  const handleUpdatePacking = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/packing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packedItemIds: selectedItemIds })
      });
      const data = await res.json();
      if (data.success) {
        setDetail((prev) => ({ ...prev, packingStatus: "sudah" }));
        showToast("Status packing berhasil diubah menjadi Sudah.", "success");
        router.refresh();
      } else {
        showToast(data.message || "Gagal memperbarui status packing.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat memperbarui packing.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShipItems = () => {
    if (selectedItemIds.length === 0) {
      showToast("Pilih setidaknya satu barang untuk dikirim.", "warning");
      return;
    }

    if (isUploading) {
      showToast("Mohon tunggu hingga proses unggah foto bukti selesai.", "warning");
      return;
    }

    const photos = parseReceiptPhotos(receiptPhotoUrl);
    if (photos.length === 0) {
      setPhotoError(true);
      showToast("Foto bukti pengiriman (resi/barang) wajib dilampirkan sebelum memproses pengiriman.", "error");
      photoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setPhotoError(false);
    setIsShipConfirmOpen(true);
  };

  const executeShipItems = async () => {
    setIsSubmitting(true);
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
        const isComplete = data.data?.status === "selesai";
        setDetail((prev) => ({
          ...prev,
          status: isComplete ? "selesai" : "selesai_setengah",
          packingStatus: "sudah",
          shippingStatus: "sudah",
          receiptPhotoUrl,
          trackingNumber
        }));
        setIsShipConfirmOpen(false);
        showToast(
          isComplete
            ? "Pengiriman selesai! Semua barang telah dikirim & status invoice Selesai."
            : "Pengiriman sebagian berhasil diproses (Status: Selesai Setengah).",
          "success"
        );
        if (isComplete && !isOwner) {
          router.replace("/delivery-orders");
        } else {
          router.refresh();
        }
      } else {
        showToast(data.message || "Gagal memproses pengiriman.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat memproses pengiriman.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveReceiptPhotos = async (newPhotoUrl?: string) => {
    const photoToSave = typeof newPhotoUrl === "string" ? newPhotoUrl : receiptPhotoUrl;
    setIsSavingPhotos(true);
    try {
      const res = await fetch(`/api/delivery-orders/${detail.id}/receipt-photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptPhotoUrl: photoToSave })
      });
      const data = await res.json();
      if (data.success) {
        setDetail((prev) => ({
          ...prev,
          receiptPhotoUrl: photoToSave
        }));
        setReceiptPhotoUrl(photoToSave);
        showToast("Foto bukti pengiriman berhasil disimpan.", "success");
        router.refresh();
      } else {
        showToast(data.message || "Gagal menyimpan foto bukti pengiriman.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan koneksi saat menyimpan foto bukti.", "error");
    } finally {
      setIsSavingPhotos(false);
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
              {isOwner ? detail.doNumber : `Surat Jalan (Inv: ${detail.sale.transactionNumber || "—"})`}
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
                ? "Selesai Sebagian"
                : "Belum Selesai"}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {isOwner && (
              <span>No Invoice / Transaksi: <span className="font-mono font-medium text-slate-700">{detail.sale.transactionNumber || "—"}</span> • </span>
            )}
            Tanggal: {formatJakartaDate(detail.sale.saleDate)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/delivery-orders/${detail.id}/print${currentUserName ? `?userName=${encodeURIComponent(currentUserName)}` : ""}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            title="Cetak Surat Jalan DO dengan Printer Thermal 80mm Bluetooth"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Cetak DO Thermal (80mm)</span>
          </Link>
          <button
            type="button"
            onClick={handleSyncItems}
            disabled={isSyncing}
            className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm"
            title="Sinkronkan daftar item DO dengan transaksi penjualan terkini"
          >
            {isSyncing ? "Menyinkronkan..." : "Sinkronkan dari Transaksi"}
          </button>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${
              detail.packingStatus === "sudah"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Packing: {detail.packingStatus === "sudah" ? "Sudah" : "Belum"}
          </span>
          {detail.packedByNameSnapshot?.toLowerCase().includes("cctv") && (
            <span
              data-testid="cctv-auto-packing-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
              title={`Dipacking otomatis oleh Kamera CCTV pada ${detail.packedAt ? formatJakartaDate(detail.packedAt) : "-"}`}
            >
              <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              CCTV Auto-Packing
            </span>
          )}
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



      {/* Customer & Expedition Information Card (STRICTLY MASKED: NO PRICES) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Informasi Penerima &amp; Pengiriman
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="block text-xs font-semibold text-slate-400">Nama Customer</span>
            <span className="text-base font-bold text-slate-900">{detail.sale.customerName}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400">Ekspedisi / Metode Kirim</span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 mt-1">
              ⛟ {detail.sale.shippingMethod || "Reguler / Ambil"}
            </span>
            {detail.sale.deliveryAt && (
              <div className="mt-1 text-xs text-slate-500">
                Jadwal Kirim: {formatJakartaDate(detail.sale.deliveryAt)}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <span className="block text-xs font-semibold text-slate-400">Alamat Lengkap / Lokasi Pengiriman</span>
            <span className="text-sm font-medium text-slate-800 break-words leading-relaxed">
              📍 {detail.sale.customerLocation || <span className="text-slate-400 italic">Alamat: —</span>}
            </span>
          </div>
        </div>

        {/* Petugas DO Section */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                Petugas DO ({assignedList.length} orang)
              </span>
              <p className="text-[11px] text-slate-500">
                Pengiriman dapat melibatkan lebih dari satu petugas DO. Petugas dapat mengajak rekan DO lainnya.
              </p>
            </div>
            {canInvite && (
              <div className="w-full sm:w-auto">
                <SearchableSelect
                  placeholder={`+ ${currentUserRole === "DELIVERY_DRIVER" ? "Ajak Petugas DO Lainnya" : "Tambah Petugas DO"}`}
                  searchPlaceholder="Cari nama atau role..."
                  options={officers
                    .filter((o) => !assignedList.some((ao) => ao.userId === o.id))
                    .map((o) => ({
                      value: o.id,
                      label: o.name,
                      badge: o.role === "DELIVERY_DRIVER" ? "Petugas DO" : o.role
                    }))}
                  onSelect={(officerId) => handleAddOfficer(officerId)}
                  align="right"
                  buttonClassName="w-full sm:w-auto font-medium text-xs px-3 py-1.5"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {assignedList.length > 0 ? (
              assignedList.map((ao) => (
                <div
                  key={ao.userId}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 border border-blue-200"
                >
                  <span>👤 {ao.userName}</span>
                  {canInvite && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOfficer(ao.userId)}
                      className="rounded-full hover:bg-blue-200 p-0.5 text-blue-600 hover:text-rose-600 font-bold transition-colors"
                      title="Hapus petugas dari DO ini"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">Belum ada petugas DO yang ditugaskan</span>
            )}
          </div>
        </div>

        {/* Packing Verification Information */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Status Packing:</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded font-bold ${
                detail.packingStatus === "sudah"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {detail.packingStatus === "sudah" ? "Sudah Packing" : "Belum Packing"}
            </span>
            {detail.packedByNameSnapshot?.toLowerCase().includes("cctv") && (
              <span
                data-testid="cctv-verified-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
              >
                <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Terverifikasi CCTV
              </span>
            )}
          </div>
          {detail.packingStatus === "sudah" && (
            <div className="text-slate-500 text-[11px]">
              Oleh: <span className="font-medium text-slate-700">{detail.packedByNameSnapshot || "Petugas"}</span>
              {detail.packedAt && (
                <span className="ml-1.5 text-slate-400">({formatJakartaDate(detail.packedAt)})</span>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Zero items alert banner */}
      {detail.items.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-amber-950">Item Surat Jalan Kosong</h3>
            <p className="text-xs text-amber-800 mt-0.5">
              Daftar barang belum terisi dari transaksi penjualan terkait. Anda dapat menyinkronkan kembali item langsung dari transaksi.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncItems}
            disabled={isSyncing}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 shrink-0 shadow-sm"
          >
            {isSyncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
          </button>
        </div>
      )}

      {/* Items Checklist Card (STRICTLY MASKED: NO PRICES, ONLY SKU, RACK, QTY, UOM) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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
                <th className="w-10 px-3 py-3 text-center">
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
                <th className="w-10 px-2 py-3 text-center">No</th>
                <th className="px-4 py-3">Produk & SKU</th>
                <th className="px-4 py-3">Lokasi / Rak Gudang</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-center">Satuan</th>
                <th className="px-4 py-3 text-center">Status Kirim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.items.map((item, index) => {
                const isChecked = selectedItemIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isChecked ? "bg-emerald-50/50" : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="w-10 px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="w-10 px-2 py-3 text-center text-xs font-semibold text-slate-600 tabular-nums">
                      {index + 1}
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
      <div
        ref={photoSectionRef}
        className={`rounded-xl border bg-white p-5 shadow-sm space-y-4 transition-all ${
          photoError ? "border-rose-400 ring-2 ring-rose-200" : "border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Bukti Pengiriman (Foto Resi / Barang)
            </h2>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              * Wajib
            </span>
          </div>
          {canProcess && (detail.status === "selesai" || detail.status === "selesai_setengah") && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              ✓ DO Selesai · Foto susulan didukung
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Bukti Pengiriman (Kamera & File) */}
          <div className="space-y-2">
            <DeliveryOrderProofUploader
              receiptPhotoUrl={receiptPhotoUrl}
              onPhotoChange={(url) => {
                setReceiptPhotoUrl(url);
                if (url) setPhotoError(false);
              }}
              onUploadingChange={setIsUploading}
              disabled={isSubmitting || isSavingPhotos}
              showToast={showToast}
              required={true}
              hasError={photoError}
            />

            {canProcess && receiptPhotoUrl !== (detail.receiptPhotoUrl || "") && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 mt-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-xs font-semibold text-amber-900">
                    Perubahan foto bukti belum disimpan ke sistem.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveReceiptPhotos()}
                  disabled={isSavingPhotos || isUploading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{isSavingPhotos ? "Menyimpan..." : "Simpan Foto Bukti"}</span>
                </button>
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
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleUpdatePacking}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none disabled:opacity-50"
          >
            Tandai Packing Selesai
          </button>

          <button
            type="button"
            disabled={isSubmitting || selectedItemIds.length === 0}
            onClick={handleShipItems}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 focus:outline-none disabled:opacity-50 transition-colors"
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

      {/* Officer Removal Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(officerToRemove)}
        title="Hapus Penugasan Petugas DO"
        message={
          officerToRemove
            ? `Apakah Anda yakin ingin menghapus "${officerToRemove.name}" dari penugasan surat jalan ini? Petugas ini tidak akan lagi melihat DO ini di antrean kerjanya.`
            : ""
        }
        confirmText="Hapus Penugasan"
        cancelText="Batal"
        variant="danger"
        isLoading={isRemovingOfficer}
        onConfirm={confirmRemoveOfficer}
        onCancel={() => {
          if (!isRemovingOfficer) setOfficerToRemove(null);
        }}
      />

      {/* Shipment Confirmation Modal */}
      <ConfirmationModal
        isOpen={isShipConfirmOpen}
        title="Konfirmasi Pengiriman Barang"
        message={
          <div className="space-y-3">
            <p>
              {selectedItemIds.length >= detail.items.length
                ? `Konfirmasi pengiriman untuk SEMUA barang (${selectedItemIds.length} item) ke customer ${detail.sale.customerName}? Status Surat Jalan dan Penjualan akan otomatis diselesaikan.`
                : `Konfirmasi pengiriman SEBAGIAN (${selectedItemIds.length} dari ${detail.items.length} item) ke customer ${detail.sale.customerName}? Status Surat Jalan akan menjadi "Selesai Sebagian".`}
            </p>
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <span className="font-bold text-emerald-600">✓</span>
              <span className="font-medium">
                Foto bukti pengiriman terlampir ({parseReceiptPhotos(receiptPhotoUrl).length} foto).
              </span>
            </div>
          </div>
        }
        confirmText={
          selectedItemIds.length >= detail.items.length
            ? "Ya, Kirim Semua Barang"
            : `Ya, Kirim ${selectedItemIds.length} Barang`
        }
        cancelText="Batal"
        variant="primary"
        isLoading={isSubmitting}
        onConfirm={executeShipItems}
        onCancel={() => {
          if (!isSubmitting) setIsShipConfirmOpen(false);
        }}
      />
    </div>
  );
}
