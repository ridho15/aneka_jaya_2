"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SaleItemRef {
  id?: string;
  productRef: string;
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  unitCostPrice?: number;
}

interface SalesReturnModalProps {
  salesRecordId: string;
  transactionNumber?: string;
  customerName: string;
  items: SaleItemRef[];
  rekenings?: { id: string; name: string }[];
  isTempo?: boolean;
}

export function SalesReturnModal({
  salesRecordId,
  transactionNumber,
  customerName,
  items,
  rekenings = [],
  isTempo = false
}: SalesReturnModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refundMethod, setRefundMethod] = useState<"REDUCE_RECEIVABLE" | "REFUND_CASH">(
    isTempo ? "REDUCE_RECEIVABLE" : "REFUND_CASH"
  );
  const [rekeningAccountId, setRekeningAccountId] = useState(rekenings[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState(
    items.map((it) => ({
      salesRecordItemId: it.id,
      productRef: it.productRef,
      productName: it.productName,
      unit: it.unit || "PCS",
      maxQty: it.quantity,
      quantity: 0,
      unitPrice: it.unitPrice,
      unitCostPrice: it.unitCostPrice || 0,
      reason: ""
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQtyChange = (index: number, val: number) => {
    setReturnItems((prev) => {
      const copy = [...prev];
      const max = copy[index].maxQty;
      const safeVal = Math.max(0, Math.min(max, val));
      copy[index].quantity = safeVal;
      return copy;
    });
  };

  const handleReasonChange = (index: number, val: string) => {
    setReturnItems((prev) => {
      const copy = [...prev];
      copy[index].reason = val;
      return copy;
    });
  };

  const activeItems = returnItems.filter((it) => it.quantity > 0);
  const totalReturnAmount = activeItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeItems.length === 0) {
      setError("Pilih minimal 1 barang dengan kuantitas retur lebih dari 0.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        salesRecordId,
        returnDate,
        customerName,
        refundMethod,
        rekeningAccountId: refundMethod === "REFUND_CASH" ? rekeningAccountId || undefined : undefined,
        notes: notes || undefined,
        items: activeItems.map((it) => ({
          salesRecordItemId: it.salesRecordItemId,
          productRef: it.productRef,
          productName: it.productName,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          unitCostPrice: it.unitCostPrice,
          reason: it.reason || undefined
        }))
      };

      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal membuat retur penjualan.");
      }

      setIsOpen(false);
      router.refresh();
      router.push("/penjualan/retur");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-xl border border-amber-600 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100 shadow-xs transition-colors"
      >
        ↩ Ajukan Retur Barang
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Ajukan Retur Penjualan</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Nota: {transactionNumber || salesRecordId} • Pelanggan: {customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Tanggal Retur
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Metode Kompensasi Retur
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-hidden"
                  >
                    {isTempo && <option value="REDUCE_RECEIVABLE">Potong Piutang Tempo (Kredit)</option>}
                    <option value="REFUND_CASH">Pengembalian Kas/Bank (Refund)</option>
                    {!isTempo && <option value="REDUCE_RECEIVABLE">Potong Piutang Usaha</option>}
                  </select>
                </div>
              </div>

              {refundMethod === "REFUND_CASH" && rekenings.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Rekening Kas/Bank Pengembalian
                  </label>
                  <select
                    value={rekeningAccountId}
                    onChange={(e) => setRekeningAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-hidden"
                  >
                    {rekenings.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Item yang Diretur
                </label>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden text-xs">
                  {returnItems.map((item, idx) => (
                    <div key={item.productRef + idx} className="p-3 bg-slate-50/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{item.productName}</p>
                          <p className="text-slate-500">
                            Terjual: {item.maxQty} {item.unit} @ Rp {item.unitPrice.toLocaleString("id-ID")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-600">Qty Retur:</span>
                          <input
                            type="number"
                            min="0"
                            max={item.maxQty}
                            value={item.quantity}
                            onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono font-bold"
                          />
                          <span className="text-slate-500">{item.unit}</span>
                        </div>
                      </div>
                      {item.quantity > 0 && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                          <input
                            type="text"
                            placeholder="Alasan retur (misal: barang cacat, salah tipe)..."
                            value={item.reason}
                            onChange={(e) => handleReasonChange(idx, e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-xs"
                          />
                          <span className="shrink-0 font-mono font-bold text-slate-700">
                            Rp {(item.quantity * item.unitPrice).toLocaleString("id-ID")}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Catatan / Keterangan
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keterangan tambahan retur penjualan..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs text-slate-500">Total Nominal Retur:</p>
                  <p className="text-base font-bold font-mono text-emerald-700">
                    Rp {totalReturnAmount.toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading || activeItems.length === 0}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {loading ? "Menyimpan..." : "Simpan Retur Penjualan"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
