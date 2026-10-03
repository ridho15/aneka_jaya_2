"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";

export type InvoiceItem = {
  index: number;
  name: string;
  code?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  category?: string;
  coa?: string;
};

export type InvoiceCustomer = {
  name: string;
  city?: string;
  phone?: string;
  address?: string;
  shippingMethod?: string;
  trackingNumber?: string;
};

export type InvoicePayment = {
  method: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  notes?: string;
};

export type TransactionInvoiceProps = {
  kind: "sales" | "expenses";
  id: string;
  transactionNumber: string;
  date: string;
  customer?: InvoiceCustomer;
  vendor?: {
    name: string;
    category?: string;
    description?: string;
    notes?: string;
  };
  items: InvoiceItem[];
  totalAmount: number;
  payment: InvoicePayment;
  isNewlyCreated?: boolean;
  approvalStatus?: string;
  cashierName?: string;
  tipeLabel?: string;
  subtotalAmount?: number;
  discountAmount?: number;
  dueDate?: string;
  dateTime?: string;
  isTempo?: boolean;
};

function formatRupiah(value: number, includeFraction = false) {
  const rounded = Math.round(value || 0);
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);

  return includeFraction ? `Rp${formatted}.00` : `Rp${formatted}`;
}

export function TransactionInvoiceView({
  kind,
  id,
  transactionNumber,
  date,
  customer,
  vendor,
  items,
  totalAmount,
  payment,
  isNewlyCreated = false,
  approvalStatus = "approved",
  cashierName,
  tipeLabel,
  subtotalAmount,
  discountAmount = 0,
  dueDate,
  dateTime,
  isTempo,
}: TransactionInvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isSales = kind === "sales";
  const isTempoSale = isSales && (isTempo || payment.method === "Tempo");
  const title = isTempoSale ? "Nota Tempo" : isSales ? "INVOICE" : "BUKTI PENGELUARAN";
  const listUrl = isSales ? "/penjualan" : "/pengeluaran";
  const inputUrl = isSales ? "/penjualan/input" : "/pengeluaran/input";
  const detailUrl = isSales ? `/penjualan/${id}` : `/pengeluaran/${id}`;
  const dotMatrixUrl = isSales
    ? `/print/sales/${id}/continuous`
    : `/print/expenses/${id}`;

  const totalQty = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const totalItemCount = items.length;

  // Export as PNG Image (2x retina pixel ratio)
  const handleExportImage = useCallback(async () => {
    if (!invoiceRef.current || isExportingImage) return;
    setIsExportingImage(true);
    setExportError(null);

    try {
      const dataUrl = await toPng(invoiceRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
          margin: "0",
        },
      });

      const link = document.createElement("a");
      const safeNumber = (transactionNumber || id).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeEntity = (customer?.name || vendor?.name || "transaksi").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      const filePrefix = isTempoSale ? "Nota_Tempo" : title;
      link.download = `${filePrefix}-${safeNumber}-${safeEntity}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Gagal mengekspor gambar:", err);
      setExportError("Gagal menyimpan gambar. Silakan coba lagi.");
    } finally {
      setIsExportingImage(false);
    }
  }, [customer?.name, id, isExportingImage, isTempoSale, title, transactionNumber, vendor?.name]);

  // Export / Print as PDF
  const handlePrintPdf = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-3 py-6 text-slate-900 sm:px-6 sm:py-10 print:bg-white print:p-0">
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print, nav, aside, header, .top-loading-bar {
            display: none !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }

          .invoice-paper {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Top Action Bar (Reference Image Style) */}
      <div className="no-print mx-auto mb-6 max-w-4xl">
        {/* Success Banner if redirected directly from transaction creation */}
        {isNewlyCreated && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                ✓
              </span>
              <div>
                <p className="font-bold text-emerald-950">
                  {isTempoSale
                    ? "Transaksi penjualan tempo berhasil disimpan!"
                    : `Transaksi ${isSales ? "penjualan" : "pengeluaran"} berhasil disimpan!`}
                </p>
                <p className="text-xs text-emerald-800">
                  {isTempoSale
                    ? "Nota tempo telah diterbitkan. Anda dapat menyimpan sebagai gambar atau cetak/simpan PDF langsung dari panel di bawah."
                    : "Faktur telah diterbitkan. Anda dapat menyimpan sebagai gambar atau cetak/simpan PDF langsung dari panel di bawah."}
                </p>
              </div>
            </div>
          </div>
        )}

        {exportError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 shadow-sm">
            {exportError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm sm:p-4">
          {/* Left Cluster Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={listUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
            >
              <span aria-hidden="true">← Kembali</span>
              <span className="sr-only">Kembali ke Riwayat</span>
            </Link>
            <Link
              href={detailUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
            >
              Detail Transaksi
            </Link>
            <Link
              href={inputUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
            >
              + {isSales ? "Penjualan Baru" : "Pengeluaran Baru"} <span className="sr-only">Input Transaksi Baru</span>
            </Link>
            {isSales && (
              <Link
                href={dotMatrixUrl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
                title="Cetak Nota Rangkap Continuous Form LX-310"
              >
                Dot Matrix <span className="sr-only">Cetak Struk Dot-Matrix</span>
              </Link>
            )}
          </div>

          {/* Right Cluster Action Buttons (SLM Primary Color + Reference Style) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportImage}
              disabled={isExportingImage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingImage ? (
                <>Memproses...</>
              ) : (
                <>
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Simpan Gambar</span>
                  <span className="sr-only">Simpan sebagai Gambar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 shadow-sm"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>Simpan PDF</span>
              <span className="sr-only">Simpan / Cetak PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Cetak</span>
            </button>
          </div>
        </div>
      </div>

      {/* The Invoice / Receipt Paper View (1:1 Match with User's Reference Image) */}
      <div
        ref={invoiceRef}
        className="invoice-paper mx-auto max-w-4xl rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none"
      >
        {/* Header Row: Big Bold Transaction ID on Left, INVOICE & Date on Right */}
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              {transactionNumber}
            </h1>
          </div>
          <div className="text-right">
            {isTempoSale ? (
              <div>
                <p className="text-base font-extrabold tracking-tight text-slate-950 sm:text-lg">
                  Nota Tempo
                </p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-800 sm:text-sm">
                  Jatuh tempo tanggal {dueDate || "-"}
                </p>
                <div className="my-2" />
                <p className="text-xs font-medium text-slate-600 sm:text-sm">
                  {dateTime || date}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">
                  {title}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800 sm:text-base">
                  {date}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Customer / Recipient Section + Stat Counters */}
        <div className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          {/* Left Column: SLM Primary Color (Emerald) Accent Bar + Customer Details */}
          <div className="border-l-[3.5px] border-emerald-600 pl-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {isSales ? "CUSTOMER" : "PENERIMA / VENDOR"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl tracking-tight">
              {isSales
                ? customer?.name || "Pelanggan Walk In"
                : vendor?.name || "Vendor / Penerima"}
            </h2>

            {/* Sales Customer Details */}
            {isSales && customer && (
              <div className="mt-1.5 space-y-0.5 text-sm text-slate-600">
                {customer.city && (
                  <p className="font-medium text-slate-800">
                    {customer.city} •
                  </p>
                )}
                {customer.address && (
                  <p className="text-slate-600 leading-relaxed max-w-md">
                    {customer.address}
                  </p>
                )}
                {customer.phone && (
                  <p className="text-slate-600">
                    Telp: {customer.phone}
                  </p>
                )}
                {customer.shippingMethod && customer.shippingMethod !== "di Tempat" && (
                  <p className="text-slate-600 mt-1">
                    Pengiriman: {customer.shippingMethod}
                    {customer.trackingNumber ? ` • Resi: ${customer.trackingNumber}` : ""}
                  </p>
                )}
              </div>
            )}

            {/* Expense Vendor Details */}
            {!isSales && vendor && (
              <div className="mt-1.5 space-y-0.5 text-sm text-slate-600">
                {vendor.category && (
                  <p className="font-medium text-slate-800">
                    Kategori: {vendor.category}
                  </p>
                )}
                {vendor.description && (
                  <p className="text-slate-600 leading-relaxed max-w-md">
                    {vendor.description}
                  </p>
                )}
                {vendor.notes && (
                  <p className="text-xs text-slate-500 italic mt-0.5">
                    Catatan: {vendor.notes}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Stat Summary Counters (ITEM & TOTAL QTY) */}
          <div className="flex items-center gap-10 self-start pr-2 sm:self-auto sm:pr-6">
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                ITEM
              </p>
              <p className="mt-1 font-mono text-3xl font-extrabold text-slate-950 sm:text-4xl">
                {totalItemCount}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {isSales ? "TOTAL QTY" : "JUMLAH TRANSAKSI"}
              </p>
              <p className="mt-1 font-mono text-3xl font-extrabold text-slate-950 sm:text-4xl">
                {isSales ? totalQty : 1}
              </p>
            </div>
          </div>
        </div>

        {/* Table of Items */}
        <div className="mb-6 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-100/90 text-[11px] font-bold uppercase tracking-wider text-slate-600 sm:text-xs">
                <th className="py-3 px-3.5 w-12 text-center">#</th>
                <th className="py-3 px-3.5">
                  {isSales ? "Nama Barang" : "Deskripsi Pengeluaran"}
                </th>
                <th className="py-3 px-3.5 text-center w-20">
                  {isSales ? "Qty" : "Kategori"}
                </th>
                <th className="py-3 px-3.5 w-24">
                  {isSales ? "Satuan" : "Akun (COA)"}
                </th>
                <th className="py-3 px-3.5 text-right w-36">
                  {isSales ? "Harga" : "Jumlah"}
                </th>
                <th className="py-3 px-3.5 text-right w-44">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((item) => (
                <tr key={item.index} className="text-slate-800">
                  <td className="py-4 px-3.5 text-center text-slate-400 font-medium">
                    {item.index}
                  </td>
                  <td className="py-4 px-3.5 font-bold text-slate-950">
                    <p>{item.name}</p>
                    {item.code && item.code !== item.name && (
                      <p className="font-mono text-xs font-normal text-slate-400 mt-0.5 tracking-tight uppercase">
                        SKU: {item.code}
                      </p>
                    )}
                  </td>
                  <td className="py-4 px-3.5 text-center font-bold text-slate-900 font-mono tabular-nums">
                    {isSales ? item.quantity : item.category || "-"}
                  </td>
                  <td className="py-4 px-3.5 text-slate-700">
                    {isSales ? item.unit : item.coa || "Kas"}
                  </td>
                  <td className="py-4 px-3.5 text-right font-medium text-slate-800 font-mono tabular-nums">
                    {formatRupiah(item.unitPrice, true)}
                  </td>
                  <td className="py-4 px-3.5 text-right font-bold text-slate-950 font-mono tabular-nums text-base">
                    {formatRupiah(item.total, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Subtotal line below table */}
          <div className="py-3 px-3.5 text-xs font-semibold text-slate-500">
            Subtotal {totalItemCount} {isSales ? "item" : "transaksi"}
          </div>
        </div>

        {/* Grand Total Full-Width Banner (Matching Reference Image) */}
        <div className="mb-8 flex items-center justify-between bg-slate-100/90 px-6 py-4 sm:px-8 sm:py-5">
          <span className="text-sm font-extrabold uppercase tracking-wider text-emerald-700 sm:text-base">
            GRAND TOTAL
          </span>
          <span className="font-mono text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            {formatRupiah(totalAmount, false)}
          </span>
        </div>

        {/* Payment Details Section with Left SLM Emerald Accent Bar */}
        <div className="mb-14 border-l-[3.5px] border-emerald-600 pl-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            PEMBAYARAN
          </p>
          <div className="mt-1 font-bold text-slate-950 text-sm sm:text-base">
            {payment.method === "Cash" || payment.method === "Tunai" ? (
              <span>
                {payment.method} • {payment.bankName || "Kas Walk In"}
              </span>
            ) : payment.method === "Tempo" ? (
              <span>
                Tempo • {payment.notes || "Belum Lunas"}
              </span>
            ) : (
              <span>
                {payment.method} • {payment.bankName || "Maybank"} • {payment.accountNumber || "8167960828"}
                {payment.accountHolder ? ` a.n. ${payment.accountHolder}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Centered Minimalist Footer (Exact Reference Image Text) */}
        <div className="mt-16 text-center text-xs text-slate-400">
          Terima kasih atas kepercayaan Anda.
        </div>
      </div>
    </div>
  );
}
