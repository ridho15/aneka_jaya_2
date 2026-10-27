"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";

interface Supplier {
  id: string;
  code: string;
  name: string;
  currency: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSuccess: () => void;
}

interface ItemDraft {
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPriceOriginal: number;
  notes?: string;
}

export function PurchaseOrderModal({ isOpen, onClose, suppliers, onSuccess }: Props) {
  const { showToast } = useToast();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState<number>(16200);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([
    { itemCode: "", itemName: "", unit: "PCS", quantity: 1, unitPriceOriginal: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-sync currency when supplier changes
  useEffect(() => {
    const sel = suppliers.find((s) => s.id === supplierId);
    if (sel && sel.currency) {
      setCurrency(sel.currency);
      if (sel.currency === "IDR") setExchangeRate(1);
      else if (sel.currency === "USD") setExchangeRate(16200);
      else if (sel.currency === "RMB") setExchangeRate(2250);
    }
  }, [supplierId, suppliers]);

  // Update exchange rate when currency changes
  const handleCurrencyChange = (curr: string) => {
    setCurrency(curr);
    if (curr === "IDR") setExchangeRate(1);
    else if (curr === "USD") setExchangeRate(16200);
    else if (curr === "RMB") setExchangeRate(2250);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { itemCode: "", itemName: "", unit: "PCS", quantity: 1, unitPriceOriginal: 0 }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ItemDraft, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  if (!isOpen) return null;

  const totalOriginal = items.reduce((sum, it) => sum + it.quantity * it.unitPriceOriginal, 0);
  const totalIdr = Math.round(totalOriginal * exchangeRate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierId) {
      showToast("Supplier wajib dipilih.", "error");
      return;
    }

    const invalidItem = items.find(
      (it) => !it.itemCode.trim() || !it.itemName.trim() || it.quantity <= 0
    );
    if (invalidItem) {
      showToast("Semua item harus memiliki kode, nama, dan kuantitas > 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          orderDate,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          currency,
          exchangeRate,
          notes: notes.trim() || undefined,
          items: items.map((it) => ({
            itemCode: it.itemCode.trim(),
            itemName: it.itemName.trim(),
            unit: it.unit.trim() || "PCS",
            quantity: Number(it.quantity),
            unitPriceOriginal: Number(it.unitPriceOriginal),
            notes: it.notes?.trim() || undefined
          }))
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal membuat Purchase Order.");
      }

      showToast(`Purchase Order ${json.data.poNumber} berhasil dibuat.`, "success");
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
      <div className="w-full max-w-4xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[92vh] flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Buat Pesanan Pembelian Baru (PO)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pesanan pembelian ke supplier domestik atau pabrik luar negeri (Valas USD / RMB).
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Supplier / Vendor <span className="text-red-500">*</span>
              </label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code} - {s.currency})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Pesanan
              </label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Estimasi Pengiriman (ETA)
              </label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Mata Uang & Kurs Estimasi
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="RMB">RMB</option>
                  <option value="IDR">IDR</option>
                </Select>
                <Input
                  type="number"
                  step="any"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                  disabled={currency === "IDR"}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Item Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Daftar Barang Dipesan
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
              >
                + Tambah Baris Barang
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-sm">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2 w-36">Kode SKU</th>
                    <th className="px-3 py-2">Nama Barang</th>
                    <th className="px-3 py-2 w-20">Satuan</th>
                    <th className="px-3 py-2 w-24 text-right">Kuantitas</th>
                    <th className="px-3 py-2 w-32 text-right">Harga ({currency})</th>
                    <th className="px-3 py-2 text-right">Subtotal ({currency})</th>
                    <th className="px-3 py-2 text-right">Estimasi (IDR)</th>
                    <th className="px-2 py-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {items.map((it, idx) => {
                    const lineValas = it.quantity * it.unitPriceOriginal;
                    const lineIdr = Math.round(lineValas * exchangeRate);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <Input
                            placeholder="SKU-001"
                            value={it.itemCode}
                            onChange={(e) => handleItemChange(idx, "itemCode", e.target.value)}
                            className="h-8 text-xs font-mono"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder="Nama deskripsi produk"
                            value={it.itemName}
                            onChange={(e) => handleItemChange(idx, "itemName", e.target.value)}
                            className="h-8 text-xs font-sans"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder="PCS"
                            value={it.unit}
                            onChange={(e) => handleItemChange(idx, "unit", e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="any"
                            min="0.01"
                            value={it.quantity || ""}
                            onChange={(e) =>
                              handleItemChange(idx, "quantity", parseFloat(e.target.value) || 0)
                            }
                            className="h-8 text-xs text-right font-mono"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={it.unitPriceOriginal || ""}
                            onChange={(e) =>
                              handleItemChange(idx, "unitPriceOriginal", parseFloat(e.target.value) || 0)
                            }
                            className="h-8 text-xs text-right font-mono font-bold"
                            required
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-900">
                          {lineValas.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right text-slate-600">
                          Rp {lineIdr.toLocaleString("id-ID")}
                        </td>
                        <td className="p-2 text-center font-sans">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-500 hover:text-red-700 font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subtotal summary card */}
          <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-sm">
            <div className="text-slate-600 text-xs">
              Kurs Konversi Estimasi: <span className="font-bold">1 {currency} = Rp {exchangeRate.toLocaleString("id-ID")}</span>
            </div>
            <div className="text-right space-y-1">
              <div className="text-slate-700">
                Total Nilai Barang:{" "}
                <span className="font-bold text-amber-900">
                  {currency} {totalOriginal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-base font-bold text-emerald-800 font-sans">
                Estimasi IDR: Rp {totalIdr.toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Catatan / Instruksi Pengiriman / Syarat Kontrak
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="FOB Shanghai, Incoterms 2020, Kemasan pallet kayu bertanda..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Purchase Order"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
