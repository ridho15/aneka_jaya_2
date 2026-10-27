"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PurchasePaymentModal } from "./PurchasePaymentModal";

export interface PurchasePaymentData {
  id: string;
  paymentNumber: string;
  purchaseInvoiceId: string;
  purchaseInvoice: {
    invoiceNumber: string;
    supplierInvoiceNumber: string;
    currency: string;
    exchangeRate: number;
  };
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  paymentDate: string;
  rekeningAccountId: string;
  rekeningAccount: { name: string; bank: string; currency?: string };
  currency: string;
  amountPaidOriginal: number;
  paymentRate: number;
  invoiceRate: number;
  settledPayableIdr: number;
  totalPaidIdr: number;
  forexDiffIdr: number;
  forexAccountCode: string;
  notes?: string | null;
  journalEntryId?: string | null;
  journalEntry?: {
    journalNumber: string;
    lines: Array<{
      accountCodeSnapshot: string;
      accountNameSnapshot: string;
      debit: number;
      credit: number;
      memo?: string | null;
    }>;
  } | null;
}

interface Props {
  initialPayments: PurchasePaymentData[];
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    supplierInvoiceNumber: string;
    supplier: { name: string; currency: string };
    currency: string;
    exchangeRate: number;
    totalAmountOriginal: number;
    totalPaidOriginal: number;
  }>;
  rekenings: Array<{ id: string; name: string; bank: string; currency?: string }>;
}

export function PurchasePaymentView({
  initialPayments,
  invoices,
  rekenings
}: Props) {
  const [payments, setPayments] = useState<PurchasePaymentData[]>(initialPayments);
  const [keyword, setKeyword] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const refreshPayments = async () => {
    try {
      const res = await fetch("/api/purchasing/payments");
      const json = await res.json();
      if (json.success) {
        setPayments(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (keyword.trim()) {
      const q = keyword.toLowerCase();
      const matchNo = p.paymentNumber.toLowerCase().includes(q);
      const matchInv =
        p.purchaseInvoice.invoiceNumber.toLowerCase().includes(q) ||
        p.purchaseInvoice.supplierInvoiceNumber.toLowerCase().includes(q);
      const matchSup =
        p.supplier.name.toLowerCase().includes(q) ||
        p.supplier.code.toLowerCase().includes(q);
      if (!matchNo && !matchInv && !matchSup) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <section className="aj-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Riwayat Pembayaran Utang Valas Supplier</h3>
            <p className="mt-1 text-xs text-slate-500">
              Pelunasan tagihan valuta asing (USD / RMB), realisasi arus kas keluar, dan pengakuan keuntungan/kerugian selisih kurs.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            + Bayar Utang Valas
          </Button>
        </div>

        {/* Search */}
        <div className="mt-4">
          <Input
            placeholder="Cari nomor pembayaran, no. faktur supplier, atau nama vendor..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="text-xs"
          />
        </div>
      </section>

      {/* Payments Table */}
      <section className="aj-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-5 py-3">No. Bayar & Tanggal</th>
                <th className="px-5 py-3">Supplier & Faktur</th>
                <th className="px-5 py-3">Rekening Sumber</th>
                <th className="px-5 py-3 text-right">Valas Dibayar & Kurs</th>
                <th className="px-5 py-3 text-right">Kas Keluar (IDR)</th>
                <th className="px-5 py-3 text-right">Selisih Kurs</th>
                <th className="px-5 py-3 text-center">Jurnal & Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Belum ada catatan pembayaran supplier.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isExpanded = expandedId === p.id;
                  const valasPaid = Number(p.amountPaidOriginal || 0);
                  const payRate = Number(p.paymentRate || 1);
                  const invRate = Number(p.invoiceRate || 1);
                  const totalPaid = Number(p.totalPaidIdr || 0);
                  const settledPayable = Number(p.settledPayableIdr || 0);
                  const forexDiff = Number(p.forexDiffIdr || 0);
                  const isGain = forexDiff > 0;
                  const isLoss = forexDiff < 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 align-top">
                      <td className="px-5 py-4">
                        <div className="font-mono text-xs font-bold text-slate-900">{p.paymentNumber}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(p.paymentDate).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{p.supplier.name}</div>
                        <div className="text-xs font-mono text-blue-700 mt-0.5">
                          Inv: {p.purchaseInvoice.invoiceNumber} ({p.purchaseInvoice.supplierInvoiceNumber})
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-800 text-xs">{p.rekeningAccount.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {p.rekeningAccount.bank} ({p.rekeningAccount.currency || "IDR"})
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono">
                        <div className="font-bold text-amber-900">
                          {p.currency} {valasPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Kurs: Rp {payRate.toLocaleString("id-ID")}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                        Rp {totalPaid.toLocaleString("id-ID")}
                        <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                          Utang: Rp {settledPayable.toLocaleString("id-ID")}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono">
                        {isGain ? (
                          <div className="inline-block px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs">
                            + Rp {forexDiff.toLocaleString("id-ID")} (Laba)
                          </div>
                        ) : isLoss ? (
                          <div className="inline-block px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-800 font-bold text-xs">
                            - Rp {Math.abs(forexDiff).toLocaleString("id-ID")} (Rugi)
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Rp 0 (Impas)</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-center">
                        {p.journalEntry ? (
                          <div>
                            <span className="font-mono text-xs font-semibold text-emerald-700 block">
                              {p.journalEntry.journalNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : p.id)}
                              className="text-[11px] text-slate-500 hover:text-slate-800 underline mt-1"
                            >
                              {isExpanded ? "Tutup Jurnal ▲" : "Lihat Jurnal ▼"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expanded Journal Lines Modal */}
      {expandedId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-sm border border-slate-200 bg-white shadow-xl max-h-[85vh] flex flex-col">
            {(() => {
              const p = payments.find((item) => item.id === expandedId);
              if (!p || !p.journalEntry) return null;
              return (
                <>
                  <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">
                        Jurnal Pembayaran {p.paymentNumber}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">
                        No. Jurnal: {p.journalEntry.journalNumber} — Supplier: {p.supplier.name}
                      </p>
                    </div>
                    <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-600">
                      ✕
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
                    <div className="border border-slate-200 rounded-sm overflow-hidden">
                      <table className="min-w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2">Akun COA</th>
                            <th className="px-3 py-2">Keterangan / Memo</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Kredit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {p.journalEntry.lines.map((l, i) => (
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
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Payment Creation Modal */}
      <PurchasePaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        invoices={invoices}
        rekenings={rekenings}
        onSuccess={refreshPayments}
      />
    </div>
  );
}
