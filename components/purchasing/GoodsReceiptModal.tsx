"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";

interface PoItem {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: { name: string };
  currency: string;
  items: PoItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: PurchaseOrder | null;
  onSuccess: () => void;
}

export function GoodsReceiptModal({ isOpen, onClose, order, onSuccess }: Props) {
  const { showToast } = useToast();
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [warehouseName, setWarehouseName] = useState("Gudang Utama");
  const [notes, setNotes] = useState("");
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !order) return null;

  const handleQtyChange = (itemId: string, val: string) => {
    const qty = parseFloat(val) || 0;
    setReceivedQtyMap((prev) => ({ ...prev, [itemId]: qty }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToReceive = order.items
      .map((it) => {
        const qtyToReceive = receivedQtyMap[it.id] ?? (it.quantity - it.receivedQuantity);
        return {
          purchaseOrderItemId: it.id,
          itemCode: it.itemCode,
          itemName: it.itemName,
          unit: it.unit,
          quantityReceived: qtyToReceive
        };
      })
      .filter((it) => it.quantityReceived > 0);

    if (itemsToReceive.length === 0) {
      showToast("Minimal harus ada 1 item dengan kuantitas diterima > 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: order.id,
          receiptDate,
          warehouseName,
          notes: notes.trim() || undefined,
          items: itemsToReceive
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memproses penerimaan barang.");
      }

      showToast(`Penerimaan barang (GRN) untuk ${order.poNumber} berhasil dicatat.`, "success");
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Penerimaan Barang (Goods Receipt)</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              PO: {order.poNumber} — Supplier: {order.supplier.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Diterima Gudang
              </label>
              <Input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Lokasi Gudang Penerima
              </label>
              <Input
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Daftar Barang Masuk
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-sm">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2">Item Barang</th>
                    <th className="px-3 py-2 text-right">Dipesan</th>
                    <th className="px-3 py-2 text-right">Sudah Diterima</th>
                    <th className="px-3 py-2 text-right">Sisa</th>
                    <th className="px-3 py-2 text-right w-32">Diterima Saat Ini</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {order.items.map((it) => {
                    const remaining = it.quantity - it.receivedQuantity;
                    const curVal = receivedQtyMap[it.id] ?? remaining;
                    return (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900 font-sans">{it.itemName}</div>
                          <div className="text-slate-400 text-[11px]">{it.itemCode}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {it.receivedQuantity} {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-amber-700">
                          {remaining} {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={remaining}
                            value={curVal}
                            onChange={(e) => handleQtyChange(it.id, e.target.value)}
                            className="text-right h-8 text-xs font-mono font-bold"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Catatan / Kondisi Fisik Kontainer / BAP
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Kondisi segel kontainer utuh, tidak ada kerusakan kemasan..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Konfirmasi Penerimaan Barang"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
