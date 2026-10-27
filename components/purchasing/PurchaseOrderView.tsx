"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { PurchaseOrderModal } from "./PurchaseOrderModal";
import { GoodsReceiptModal } from "./GoodsReceiptModal";

export interface PurchaseOrderItemData {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
  unitPriceOriginal: number;
  unitPriceIdr: number;
  totalAmountOriginal: number;
  totalAmountIdr: number;
  notes?: string | null;
}

export interface PurchaseReceiptData {
  id: string;
  grnNumber: string;
  receiptDate: string;
  warehouseName: string;
  receivedByNameSnapshot: string;
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    quantityReceived: number;
  }>;
}

export interface PurchaseOrderData {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: { id: string; code: string; name: string; currency: string };
  orderDate: string;
  expectedDeliveryDate?: string | null;
  currency: string;
  exchangeRate: number;
  subtotalOriginal: number;
  subtotalIdr: number;
  totalAmountOriginal: number;
  totalAmountIdr: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PARTIAL_RECEIVED" | "COMPLETED" | "CANCELLED";
  notes?: string | null;
  createdByNameSnapshot: string;
  approvedByNameSnapshot?: string | null;
  approvedAt?: string | null;
  items: PurchaseOrderItemData[];
  receipts?: PurchaseReceiptData[];
}

interface Props {
  initialOrders: PurchaseOrderData[];
  suppliers: Array<{ id: string; code: string; name: string; currency: string }>;
}

export function PurchaseOrderView({ initialOrders, suppliers }: Props) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<PurchaseOrderData[]>(initialOrders);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [keyword, setKeyword] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [grnOrder, setGrnOrder] = useState<PurchaseOrderData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const refreshOrders = async () => {
    try {
      const res = await fetch("/api/purchasing/orders");
      const json = await res.json();
      if (json.success) {
        setOrders(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (
    id: string,
    status: "SUBMITTED" | "APPROVED" | "CANCELLED"
  ) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/purchasing/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memperbarui status PO.");
      }
      showToast(`Status PO berhasil diperbarui menjadi ${status}.`, "success");
      await refreshOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (keyword.trim()) {
      const q = keyword.toLowerCase();
      const matchPo = o.poNumber.toLowerCase().includes(q);
      const matchSup = o.supplier.name.toLowerCase().includes(q) || o.supplier.code.toLowerCase().includes(q);
      if (!matchPo && !matchSup) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Draft</span>;
      case "SUBMITTED":
        return <span className="rounded-sm border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">Diajukan</span>;
      case "APPROVED":
        return <span className="rounded-sm border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Disetujui</span>;
      case "PARTIAL_RECEIVED":
        return <span className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Diterima Sebagian</span>;
      case "COMPLETED":
        return <span className="rounded-sm border border-emerald-500 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">Selesai (Lengkap)</span>;
      case "CANCELLED":
        return <span className="rounded-sm border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">Dibatalkan</span>;
      default:
        return <span className="rounded-sm border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <section className="aj-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Daftar Pesanan Pembelian (PO)</h3>
            <p className="mt-1 text-xs text-slate-500">
              Kelola proses pemesanan barang impor/lokal dari tahap draft, persetujuan, hingga penerimaan fisik barang gudang.
            </p>
          </div>
          <Button onClick={() => setIsPoModalOpen(true)}>
            + Buat PO Baru
          </Button>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Cari nomor PO atau nama supplier..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Diajukan</option>
              <option value="APPROVED">Disetujui</option>
              <option value="PARTIAL_RECEIVED">Diterima Sebagian</option>
              <option value="COMPLETED">Selesai (Lengkap)</option>
              <option value="CANCELLED">Dibatalkan</option>
            </Select>
          </div>
        </div>
      </section>

      {/* Orders Table */}
      <section className="aj-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-5 py-3">No. PO & Tanggal</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Mata Uang & Kurs</th>
                <th className="px-5 py-3 text-right">Total Valas</th>
                <th className="px-5 py-3 text-right">Estimasi IDR</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi & Alur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Tidak ada pesanan pembelian yang sesuai dengan kriteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isExpanded = expandedId === o.id;
                  const totalOriginal = Number(o.totalAmountOriginal || 0);
                  const totalIdr = Number(o.totalAmountIdr || 0);
                  const exchangeRate = Number(o.exchangeRate || 1);

                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 align-top">
                      <td className="px-5 py-4">
                        <div className="font-mono text-xs font-bold text-slate-900">{o.poNumber}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(o.orderDate).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </div>
                        {o.expectedDeliveryDate && (
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            ETA: {new Date(o.expectedDeliveryDate).toLocaleDateString("id-ID")}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{o.supplier.name}</div>
                        <div className="text-xs font-mono text-slate-400">{o.supplier.code}</div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900">
                          {o.currency}
                        </span>
                        {o.currency !== "IDR" && (
                          <div className="text-[11px] font-mono text-slate-500 mt-1">
                            Kurs: Rp {exchangeRate.toLocaleString("id-ID")}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-amber-900">
                        {o.currency} {totalOriginal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-5 py-4 text-right font-mono text-slate-800">
                        Rp {totalIdr.toLocaleString("id-ID")}
                      </td>

                      <td className="px-5 py-4 text-center">{getStatusBadge(o.status)}</td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {/* Workflow buttons */}
                          {o.status === "DRAFT" && (
                            <button
                              disabled={isUpdatingStatus}
                              onClick={() => handleUpdateStatus(o.id, "SUBMITTED")}
                              className="rounded-sm border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Ajukan PO
                            </button>
                          )}

                          {o.status === "SUBMITTED" && (
                            <div className="flex gap-1.5">
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleUpdateStatus(o.id, "APPROVED")}
                                className="rounded-sm border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Setujui PO
                              </button>
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleUpdateStatus(o.id, "CANCELLED")}
                                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              >
                                Batalkan
                              </button>
                            </div>
                          )}

                          {(o.status === "APPROVED" || o.status === "PARTIAL_RECEIVED") && (
                            <button
                              onClick={() => setGrnOrder(o)}
                              className="rounded-sm border border-emerald-700 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                            >
                              + Terima Barang (GRN)
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : o.id)}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-900 mt-1"
                          >
                            {isExpanded ? "Tutup Rincian ▲" : "Lihat Rincian ▼"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expanded PO Detail Modal / Section */}
      {expandedId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[85vh] flex flex-col">
            {(() => {
              const po = orders.find((o) => o.id === expandedId);
              if (!po) return null;
              return (
                <>
                  <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">Rincian Purchase Order {po.poNumber}</h4>
                      <p className="text-xs text-slate-500 font-mono">
                        Supplier: {po.supplier.name} ({po.supplier.code})
                      </p>
                    </div>
                    <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-600">
                      ✕
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
                    <div className="border border-slate-200 rounded-sm overflow-hidden">
                      <table className="min-w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                          <tr>
                            <th className="px-3 py-2 font-sans">Item / SKU</th>
                            <th className="px-3 py-2 text-right">Dipesan</th>
                            <th className="px-3 py-2 text-right">Diterima</th>
                            <th className="px-3 py-2 text-right">Harga Satuan</th>
                            <th className="px-3 py-2 text-right">Subtotal Valas</th>
                            <th className="px-3 py-2 text-right">Estimasi IDR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {po.items.map((it) => (
                            <tr key={it.id}>
                              <td className="px-3 py-2">
                                <div className="font-semibold text-slate-900 font-sans">{it.itemName}</div>
                                <div className="text-slate-400 text-[10px]">{it.itemCode}</div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {it.quantity} {it.unit}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-700">
                                {it.receivedQuantity} {it.unit}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {po.currency} {Number(it.unitPriceOriginal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-amber-900">
                                {po.currency} {Number(it.totalAmountOriginal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                Rp {Number(it.totalAmountIdr).toLocaleString("id-ID")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {po.receipts && po.receipts.length > 0 && (
                      <div className="mt-4">
                        <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 font-sans">
                          Riwayat Penerimaan Fisik Barang (GRN)
                        </div>
                        <div className="space-y-2">
                          {po.receipts.map((grn) => (
                            <div key={grn.id} className="p-3 bg-slate-50 border border-slate-200 rounded-sm">
                              <div className="flex justify-between items-center text-slate-800">
                                <span className="font-bold text-emerald-800">{grn.grnNumber}</span>
                                <span>{new Date(grn.receiptDate).toLocaleDateString("id-ID")} ({grn.warehouseName})</span>
                              </div>
                              <div className="text-slate-500 text-[11px] mt-1 font-sans">
                                Diterima oleh: {grn.receivedByNameSnapshot}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* PO Creation Modal */}
      <PurchaseOrderModal
        isOpen={isPoModalOpen}
        onClose={() => setIsPoModalOpen(false)}
        suppliers={suppliers}
        onSuccess={refreshOrders}
      />

      {/* Goods Receipt Modal */}
      <GoodsReceiptModal
        isOpen={Boolean(grnOrder)}
        onClose={() => setGrnOrder(null)}
        order={grnOrder}
        onSuccess={refreshOrders}
      />
    </div>
  );
}
