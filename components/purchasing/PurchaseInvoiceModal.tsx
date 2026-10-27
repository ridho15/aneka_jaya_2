"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import {
  allocateLandedCost,
  type LandedCostInputItem,
  type LandedCostCalculationFee
} from "@/lib/purchasing/landedCostCalculator";
import type { LandedCostType, LandedCostAllocationMethod } from "@prisma/client";

interface Supplier {
  id: string;
  code: string;
  name: string;
  currency: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  currency: string;
  subtotalOriginal: number;
  exchangeRate: number;
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
    quantity: number;
    unitPriceOriginal: number;
  }>;
}

interface Rekening {
  id: string;
  name: string;
  bank: string;
  currency?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  rekenings: Rekening[];
  onSuccess: () => void;
}

interface LandedCostDraft {
  costType: LandedCostType;
  isCreditableTax: boolean;
  description: string;
  vendorName: string;
  originalCurrency: string;
  originalAmount: number;
  exchangeRate: number;
  allocationMethod: LandedCostAllocationMethod;
  paymentAccountId: string;
}

const LANDED_COST_TYPES: Array<{ type: LandedCostType; label: string; defaultCreditable: boolean }> = [
  { type: "FREIGHT", label: "Ongkos Angkut (Freight Sea/Air)", defaultCreditable: false },
  { type: "CUSTOMS_DUTY", label: "Bea Masuk (Customs Duty)", defaultCreditable: false },
  { type: "IMPORT_TAX_PPN", label: "PPN Impor (Creditable Tax)", defaultCreditable: true },
  { type: "IMPORT_TAX_PPH22", label: "PPh Pasal 22 Impor (Creditable Tax)", defaultCreditable: true },
  { type: "INSURANCE", label: "Asuransi Pengapalan (Marine Insurance)", defaultCreditable: false },
  { type: "HANDLING", label: "Biaya Handling Pelabuhan / EMKL", defaultCreditable: false },
  { type: "OTHER", label: "Biaya Impor Lainnya", defaultCreditable: false }
];

export function PurchaseInvoiceModal({
  isOpen,
  onClose,
  suppliers,
  purchaseOrders,
  rekenings,
  onSuccess
}: Props) {
  const { showToast } = useToast();
  const [selectedPoId, setSelectedPoId] = useState("");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState<number>(16250);
  const [subtotalOriginal, setSubtotalOriginal] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const [landedCosts, setLandedCosts] = useState<LandedCostDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When PO is selected, populate supplier, currency, subtotal, and rate
  const handlePoSelect = (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) return;

    const po = purchaseOrders.find((p) => p.id === poId);
    if (po) {
      setSupplierId(po.supplierId);
      setCurrency(po.currency);
      setSubtotalOriginal(po.subtotalOriginal);
      setExchangeRate(po.exchangeRate || 16250);
    }
  };

  const handleAddLandedCost = () => {
    setLandedCosts((prev) => [
      ...prev,
      {
        costType: "FREIGHT",
        isCreditableTax: false,
        description: "Ongkos Angkut Ekspedisi",
        vendorName: "",
        originalCurrency: "IDR",
        originalAmount: 0,
        exchangeRate: 1,
        allocationMethod: "BY_VALUE",
        paymentAccountId: ""
      }
    ]);
  };

  const handleRemoveLandedCost = (idx: number) => {
    setLandedCosts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLandedCostChange = (idx: number, field: keyof LandedCostDraft, val: any) => {
    setLandedCosts((prev) => {
      const copy = [...prev];
      const item = { ...copy[idx], [field]: val };

      // Auto update creditable if type changed
      if (field === "costType") {
        const found = LANDED_COST_TYPES.find((t) => t.type === val);
        if (found) {
          item.isCreditableTax = found.defaultCreditable;
        }
      }
      copy[idx] = item;
      return copy;
    });
  };

  if (!isOpen) return null;

  // Selected PO items for preview
  const activePo = purchaseOrders.find((p) => p.id === selectedPoId);
  const calculationItems: LandedCostInputItem[] = (activePo?.items || []).map((it) => ({
    id: it.id,
    itemCode: it.itemCode,
    itemName: it.itemName,
    quantity: it.quantity,
    unitPriceOriginal: it.unitPriceOriginal
  }));

  const calculationFees: LandedCostCalculationFee[] = landedCosts.map((lc, i) => ({
    id: `fee-${i}`,
    costType: lc.costType,
    isCreditableTax: lc.isCreditableTax,
    amountIdr: Math.round(lc.originalAmount * (lc.exchangeRate || 1)),
    allocationMethod: lc.allocationMethod,
    description: lc.description
  }));

  const allocationResult =
    calculationItems.length > 0
      ? allocateLandedCost(calculationItems, calculationFees, exchangeRate)
      : null;

  const subtotalIdr = Math.round(subtotalOriginal * exchangeRate);
  const nonCreditableLandedTotal = calculationFees
    .filter((f) => !f.isCreditableTax)
    .reduce((sum, f) => sum + f.amountIdr, 0);
  const creditableTaxTotal = calculationFees
    .filter((f) => f.isCreditableTax)
    .reduce((sum, f) => sum + f.amountIdr, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierInvoiceNumber.trim()) {
      showToast("Nomor invoice supplier wajib diisi.", "error");
      return;
    }
    if (subtotalOriginal <= 0) {
      showToast("Nilai invoice harus lebih dari 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          purchaseOrderId: selectedPoId || undefined,
          supplierId,
          invoiceDate,
          dueDate,
          currency,
          exchangeRate,
          subtotalOriginal,
          landedCosts: landedCosts.map((lc) => ({
            costType: lc.costType,
            isCreditableTax: lc.isCreditableTax,
            description: lc.description.trim(),
            vendorName: lc.vendorName.trim() || undefined,
            originalCurrency: lc.originalCurrency,
            originalAmount: Number(lc.originalAmount),
            exchangeRate: Number(lc.exchangeRate || 1),
            amountIdr: Math.round(Number(lc.originalAmount) * Number(lc.exchangeRate || 1)),
            allocationMethod: lc.allocationMethod,
            paymentAccountId: lc.paymentAccountId || undefined
          })),
          notes: notes.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal membuat invoice pembelian.");
      }

      showToast(`Invoice ${json.data.invoiceNumber} berhasil disimpan.`, "success");
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
      <div className="w-full max-w-5xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[92vh] flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Input Tagihan Pembelian & Landed Cost Impor</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Catat faktur tagihan supplier valas dan alokasikan ongkos angkut, bea masuk, serta pajak impor (PPN/PPh22).
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tautkan PO (Opsional)
              </label>
              <Select value={selectedPoId} onChange={(e) => handlePoSelect(e.target.value)}>
                <option value="">-- Tanpa PO (Invoice Langsung) --</option>
                {purchaseOrders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNumber} ({p.currency} {Number(p.subtotalOriginal).toLocaleString("en-US")})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Supplier <span className="text-red-500">*</span>
              </label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                No. Faktur Supplier (Asing) <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="INV-VENDOR-2026-X"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tanggal Faktur & Jatuh Tempo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                />
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Currency & Subtotal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-sm">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Mata Uang Tagihan
              </label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD - US Dollar</option>
                <option value="RMB">RMB - Chinese Yuan</option>
                <option value="IDR">IDR - Rupiah</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Kurs Invoice / Pajak KMK (Rp/{currency})
              </label>
              <Input
                type="number"
                step="any"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                className="font-mono text-xs font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Nilai Tagihan Barang ({currency})
              </label>
              <Input
                type="number"
                step="any"
                value={subtotalOriginal || ""}
                onChange={(e) => setSubtotalOriginal(parseFloat(e.target.value) || 0)}
                className="font-mono text-xs font-bold text-amber-900"
                required
              />
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                ≈ Rp {subtotalIdr.toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          {/* Landed Cost Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Komponen Landed Cost & Pajak Impor
                </span>
                <p className="text-[11px] text-slate-500">
                  Ongkir & bea masuk akan mengkapitalisasi persediaan (HPP). PPN Impor & PPh 22 masuk akun Pajak Dibayar Dimuka.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLandedCost}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
              >
                + Tambah Biaya Landed Cost
              </button>
            </div>

            {landedCosts.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                Belum ada biaya landed cost ditambahkan. Klik &quot;+ Tambah Biaya Landed Cost&quot; untuk menambahkan freight, bea masuk, atau pajak impor.
              </div>
            ) : (
              <div className="space-y-2">
                {landedCosts.map((lc, idx) => {
                  const feeIdr = Math.round(lc.originalAmount * (lc.exchangeRate || 1));
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded border text-xs grid grid-cols-1 md:grid-cols-12 gap-2 items-center ${
                        lc.isCreditableTax ? "bg-purple-50/60 border-purple-200" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="md:col-span-3">
                        <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-0.5">
                          Jenis Biaya
                        </label>
                        <Select
                          value={lc.costType}
                          onChange={(e) =>
                            handleLandedCostChange(idx, "costType", e.target.value as LandedCostType)
                          }
                          className="h-8 text-xs"
                        >
                          {LANDED_COST_TYPES.map((t) => (
                            <option key={t.type} value={t.type}>
                              {t.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-0.5">
                          Keterangan / Vendor
                        </label>
                        <Input
                          placeholder="e.g. PT Samudera Logistik"
                          value={lc.description}
                          onChange={(e) => handleLandedCostChange(idx, "description", e.target.value)}
                          className="h-8 text-xs font-sans"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-0.5">
                          Nominal ({lc.originalCurrency})
                        </label>
                        <Input
                          type="number"
                          step="any"
                          value={lc.originalAmount || ""}
                          onChange={(e) =>
                            handleLandedCostChange(idx, "originalAmount", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-xs font-mono font-bold text-right"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-0.5">
                          Alokasi
                        </label>
                        <Select
                          value={lc.allocationMethod}
                          onChange={(e) =>
                            handleLandedCostChange(
                              idx,
                              "allocationMethod",
                              e.target.value as LandedCostAllocationMethod
                            )
                          }
                          className="h-8 text-xs"
                        >
                          <option value="BY_VALUE">Proporsi Nilai (Value)</option>
                          <option value="BY_QUANTITY">Proporsi Kuantitas (Qty)</option>
                        </Select>
                      </div>

                      <div className="md:col-span-2 flex items-center justify-between gap-1">
                        <div>
                          <div className="font-mono text-slate-700 font-bold">
                            Rp {feeIdr.toLocaleString("id-ID")}
                          </div>
                          <span
                            className={`inline-block text-[9px] px-1 py-0.2 rounded font-semibold ${
                              lc.isCreditableTax
                                ? "bg-purple-200 text-purple-900"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {lc.isCreditableTax ? "Kredit Pajak (1-1006)" : "HPP Barang (1-1005)"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLandedCost(idx)}
                          className="text-red-500 hover:text-red-700 font-bold text-sm ml-2"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Allocation & Real Unit HPP Preview Table */}
          {allocationResult && calculationItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Simulasi Alokasi Biaya & HPP Riil per Unit (SKU)
              </div>
              <div className="border border-slate-200 rounded-sm overflow-x-auto">
                <table className="min-w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2 font-sans">Kode & Nama Barang</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Harga Beli IDR</th>
                      <th className="px-3 py-2 text-right">Landed Cost IDR</th>
                      <th className="px-3 py-2 text-right">Total Biaya IDR</th>
                      <th className="px-3 py-2 text-right font-bold text-emerald-800">
                        HPP Riil / Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocationResult.items.map((row) => (
                      <tr key={row.itemId} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900 font-sans">{row.itemName}</div>
                          <div className="text-slate-400 text-[10px]">{row.itemCode}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">{row.quantity}</td>
                        <td className="px-3 py-2 text-right">Rp {row.itemBaseIdr.toLocaleString("id-ID")}</td>
                        <td className="px-3 py-2 text-right text-amber-800">
                          + Rp {row.allocatedLandedCostIdr.toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">
                          Rp {row.totalCostIdr.toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-800 bg-emerald-50/40">
                          Rp {row.finalUnitCostIdr.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Total Summary Banner */}
          <div className="p-4 rounded-sm border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <div className="text-slate-500">Nilai Masuk Persediaan (1-1005):</div>
              <div className="text-sm font-bold text-emerald-800">
                Rp {(subtotalIdr + nonCreditableLandedTotal).toLocaleString("id-ID")}
              </div>
              <div className="text-[10px] text-slate-400">
                Barang Rp {subtotalIdr.toLocaleString("id-ID")} + Landed Rp {nonCreditableLandedTotal.toLocaleString("id-ID")}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Pajak Dibayar Dimuka (1-1006):</div>
              <div className="text-sm font-bold text-purple-800">
                Rp {creditableTaxTotal.toLocaleString("id-ID")}
              </div>
              <div className="text-[10px] text-slate-400">PPN Impor & PPh 22 creditable</div>
            </div>

            <div className="sm:text-right">
              <div className="text-slate-500">Utang Usaha Supplier (2-1001):</div>
              <div className="text-base font-bold text-slate-900">
                {currency} {subtotalOriginal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-600">
                ≈ Rp {subtotalIdr.toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Catatan Faktur
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan nomor PIB (Pemberitahuan Impor Barang), no SPPB..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Tagihan Pembelian"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
