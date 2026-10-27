"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { PurchaseInvoiceModal } from "./PurchaseInvoiceModal";

export interface LandedCostItemData {
  id: string;
  costType: string;
  isCreditableTax: boolean;
  description: string;
  vendorName?: string | null;
  originalCurrency: string;
  originalAmount: number;
  exchangeRate: number;
  amountIdr: number;
  allocationMethod: string;
}

export interface PurchaseInvoiceData {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string;
  purchaseOrderId?: string | null;
  purchaseOrder?: { poNumber: string } | null;
  supplierId: string;
  supplier: { id: string; code: string; name: string; currency: string };
  invoiceDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  subtotalOriginal: number;
  subtotalIdr: number;
  landedCostTotalIdr: number;
  totalAmountOriginal: number;
  totalAmountIdr: number;
  totalPaidOriginal: number;
  totalPaidIdr: number;
  status: "DRAFT" | "POSTED" | "PARTIAL_PAID" | "PAID" | "CANCELLED";
  notes?: string | null;
  journalEntryId?: string | null;
  journalEntry?: {
    journalNumber: string;
    totalDebit: number;
    lines: Array<{
      accountCodeSnapshot: string;
      accountNameSnapshot: string;
      debit: number;
      credit: number;
      memo?: string | null;
    }>;
  } | null;
  landedCosts: LandedCostItemData[];
}

interface Props {
  initialInvoices: PurchaseInvoiceData[];
  suppliers: Array<{ id: string; code: string; name: string; currency: string }>;
  purchaseOrders: Array<{
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
  }>;
  rekenings: Array<{ id: string; name: string; bank: string; currency?: string }>;
}

export function PurchaseInvoiceView({
  initialInvoices,
  suppliers,
  purchaseOrders,
  rekenings
}: Props) {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<PurchaseInvoiceData[]>(initialInvoices);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [keyword, setKeyword] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const refreshInvoices = async () => {
    try {
      const res = await fetch("/api/purchasing/invoices");
      const json = await res.json();
      if (json.success) {
        setInvoices(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostInvoice = async (id: string, invoiceNumber: string) => {
    if (!confirm(`Post invoice ${invoiceNumber} ke pembukuan resmi? Tindakan ini akan mengkapitalisasi HPP persediaan dan membuat jurnal umum.`)) {
      return;
    }

    setIsPosting(true);
    try {
      const res = await fetch(`/api/purchasing/invoices/${id}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal mem-posting invoice.");
      }

      showToast(`Invoice ${invoiceNumber} berhasil di-post dan dijurnal.`, "success");
      await refreshInvoices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Terjadi kesalahan.", "error");
    } finally {
      setIsPosting(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (filterStatus !== "ALL" && inv.status !== filterStatus) return false;
    if (keyword.trim()) {
      const q = keyword.toLowerCase();
      const matchInv =
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.supplierInvoiceNumber.toLowerCase().includes(q);
      const matchSup =
        inv.supplier.name.toLowerCase().includes(q) ||
        inv.supplier.code.toLowerCase().includes(q);
      if (!matchInv && !matchSup) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Draft (Belum Jurnal)</span>;
      case "POSTED":
        return <span className="rounded-sm border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">Posted (Belum Bayar)</span>;
      case "PARTIAL_PAID":
        return <span className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Dibayar Sebagian</span>;
      case "PAID":
        return <span className="rounded-sm border border-emerald-500 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">Lunas (Paid)</span>;
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
            <h3 className="font-bold text-slate-900">Tagihan Pembelian & Landed Cost</h3>
            <p className="mt-1 text-xs text-slate-500">
              Pencatatan faktur supplier valas, kapitalisasi landed cost (ongkos angkut, bea masuk) ke persediaan, dan isolasi pajak impor creditable (PPN / PPh 22).
            </p>
          </div>
          <Button onClick={() => setIsInvoiceModalOpen(true)}>
            + Buat Tagihan Baru
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Cari nomor invoice SLM, faktur vendor, atau nama supplier..."
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
              <option value="POSTED">Posted</option>
              <option value="PARTIAL_PAID">Dibayar Sebagian</option>
              <option value="PAID">Lunas</option>
            </Select>
          </div>
        </div>
      </section>

      {/* Invoices Table */}
      <section className="aj-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-5 py-3">No. Faktur & Tanggal</th>
                <th className="px-5 py-3">Supplier & Tautan PO</th>
                <th className="px-5 py-3">Kurs Pembukuan</th>
                <th className="px-5 py-3 text-right">Tagihan Valas</th>
                <th className="px-5 py-3 text-right">Landed Cost IDR</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Tidak ada tagihan pembelian yang sesuai dengan kriteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isExpanded = expandedId === inv.id;
                  const totalOriginal = Number(inv.totalAmountOriginal || 0);
                  const totalPaidOriginal = Number(inv.totalPaidOriginal || 0);
                  const landedTotalIdr = Number(inv.landedCostTotalIdr || 0);
                  const exchangeRate = Number(inv.exchangeRate || 1);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 align-top">
                      <td className="px-5 py-4">
                        <div className="font-mono text-xs font-bold text-slate-900">{inv.invoiceNumber}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Vendor: <span className="font-mono font-medium">{inv.supplierInvoiceNumber}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Tgl: {new Date(inv.invoiceDate).toLocaleDateString("id-ID")}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{inv.supplier.name}</div>
                        {inv.purchaseOrder ? (
                          <div className="text-xs font-mono text-blue-700 mt-0.5">
                            PO: {inv.purchaseOrder.poNumber}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 mt-0.5">Tanpa PO</div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900">
                          {inv.currency}
                        </span>
                        {inv.currency !== "IDR" && (
                          <div className="text-[11px] font-mono text-slate-500 mt-1">
                            Kurs: Rp {exchangeRate.toLocaleString("id-ID")}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-mono">
                        <div className="font-bold text-amber-900">
                          {inv.currency} {totalOriginal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        {totalPaidOriginal > 0 && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Dibayar: {inv.currency} {totalPaidOriginal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-mono">
                        {landedTotalIdr > 0 ? (
                          <span className="font-semibold text-emerald-800">
                            + Rp {landedTotalIdr.toLocaleString("id-ID")}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-center">{getStatusBadge(inv.status)}</td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {inv.status === "DRAFT" && (
                            <button
                              disabled={isPosting}
                              onClick={() => handlePostInvoice(inv.id, inv.invoiceNumber)}
                              className="rounded-sm border border-emerald-700 bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Post Jurnal & HPP
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
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

      {/* Expanded Invoice Detail Modal */}
      {expandedId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[85vh] flex flex-col">
            {(() => {
              const inv = invoices.find((i) => i.id === expandedId);
              if (!inv) return null;
              return (
                <>
                  <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">
                        Rincian Tagihan {inv.invoiceNumber}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">
                        Supplier: {inv.supplier.name} — Faktur Vendor: {inv.supplierInvoiceNumber}
                      </p>
                    </div>
                    <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-600">
                      ✕
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
                    {/* Landed costs table */}
                    <div>
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2 font-sans">
                        Komponen Landed Cost & Pajak Impor
                      </div>
                      {inv.landedCosts.length === 0 ? (
                        <div className="text-slate-400 italic">Tidak ada biaya landed cost.</div>
                      ) : (
                        <div className="border border-slate-200 rounded-sm overflow-hidden">
                          <table className="min-w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                              <tr>
                                <th className="px-3 py-2">Jenis Biaya</th>
                                <th className="px-3 py-2">Keterangan</th>
                                <th className="px-3 py-2 text-right">Nominal IDR</th>
                                <th className="px-3 py-2">Perlakuan Akuntansi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inv.landedCosts.map((lc) => (
                                <tr key={lc.id}>
                                  <td className="px-3 py-2 font-bold text-slate-800">{lc.costType}</td>
                                  <td className="px-3 py-2 font-sans text-slate-600">{lc.description}</td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                                    Rp {Number(lc.amountIdr).toLocaleString("id-ID")}
                                  </td>
                                  <td className="px-3 py-2 font-sans">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                        lc.isCreditableTax
                                          ? "bg-purple-100 text-purple-800"
                                          : "bg-emerald-100 text-emerald-800"
                                      }`}
                                    >
                                      {lc.isCreditableTax ? "Kredit Pajak (1-1006)" : "Kapitalisasi Persediaan (1-1005)"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Linked Journal */}
                    {inv.journalEntry && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2 font-sans flex justify-between">
                          <span>Jurnal Otomatis Pembukuan</span>
                          <span className="text-emerald-700">{inv.journalEntry.journalNumber}</span>
                        </div>
                        <div className="border border-slate-200 rounded-sm overflow-hidden">
                          <table className="min-w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                              <tr>
                                <th className="px-3 py-2">Akun COA</th>
                                <th className="px-3 py-2">Memo</th>
                                <th className="px-3 py-2 text-right">Debit</th>
                                <th className="px-3 py-2 text-right">Kredit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inv.journalEntry.lines.map((l, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2">
                                    <span className="font-bold text-slate-900">{l.accountCodeSnapshot}</span>{" "}
                                    <span className="font-sans text-slate-600">{l.accountNameSnapshot}</span>
                                  </td>
                                  <td className="px-3 py-2 font-sans text-slate-500 text-[11px]">{l.memo || "-"}</td>
                                  <td className="px-3 py-2 text-right text-emerald-800">
                                    {Number(l.debit) > 0 ? `Rp ${Number(l.debit).toLocaleString("id-ID")}` : "-"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-700">
                                    {Number(l.credit) > 0 ? `Rp ${Number(l.credit).toLocaleString("id-ID")}` : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

      {/* Invoice Creation Modal */}
      <PurchaseInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
        rekenings={rekenings}
        onSuccess={refreshInvoices}
      />
    </div>
  );
}
