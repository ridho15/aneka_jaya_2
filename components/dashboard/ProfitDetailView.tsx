"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  DashboardProfitDetails,
  ProfitDetailSale,
} from "@/lib/dashboard/summary";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProfitDetailView({ data }: { data: DashboardProfitDetails }) {
  const [activeTab, setActiveTab] = useState<"sales" | "expenses">("sales");
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(new Set());

  const [salesPage, setSalesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const PAGE_SIZE = 15;

  const totalSales = data.sales.length;
  const totalSalesPages = Math.max(1, Math.ceil(totalSales / PAGE_SIZE));
  const curSalesPage = Math.min(Math.max(1, salesPage), totalSalesPages);
  const salesStart = (curSalesPage - 1) * PAGE_SIZE;
  const salesEnd = Math.min(salesStart + PAGE_SIZE, totalSales);
  const pagedSales = useMemo(
    () => data.sales.slice(salesStart, salesEnd),
    [data.sales, salesStart, salesEnd]
  );

  const totalExpenses = data.expenses.length;
  const totalExpensesPages = Math.max(1, Math.ceil(totalExpenses / PAGE_SIZE));
  const curExpensesPage = Math.min(Math.max(1, expensesPage), totalExpensesPages);
  const expensesStart = (curExpensesPage - 1) * PAGE_SIZE;
  const expensesEnd = Math.min(expensesStart + PAGE_SIZE, totalExpenses);
  const pagedExpenses = useMemo(
    () => data.expenses.slice(expensesStart, expensesEnd),
    [data.expenses, expensesStart, expensesEnd]
  );

  const pagedSaleIds = useMemo(() => pagedSales.map((s) => s.id), [pagedSales]);
  const isAllPagedExpanded =
    pagedSaleIds.length > 0 && pagedSaleIds.every((id) => expandedSaleIds.has(id));

  const toggleAllCurrent = () => {
    if (isAllPagedExpanded) {
      setExpandedSaleIds((prev) => {
        const next = new Set(prev);
        pagedSaleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setExpandedSaleIds((prev) => {
        const next = new Set(prev);
        pagedSaleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSale = (id: string) => {
    setExpandedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Rekonsiliasi Formula (Dark Slate Theme + Emerald Highlights) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Rekonsiliasi Sumber Data Profit
              </p>
            </div>
            <h3 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Kalkulasi Laba Bersih Operasional
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
              Margin Efektif: {data.effectiveMarginPercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Periode: {data.periodLabel}
            </span>
          </div>
        </div>

        {/* 5 Finansial Pillars Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Pillar 1: Total Omzet Jual */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1. Total Omzet Jual
            </p>
            <p className="mt-2 font-mono text-xl font-extrabold text-blue-400 sm:text-2xl">
              {rupiah(data.totalRevenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.salesCount} transaksi approved
            </p>
          </div>

          {/* Pillar 2: Total Modal / HPP */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2. Total Modal / HPP
            </p>
            <p className="mt-2 font-mono text-xl font-extrabold text-amber-400 sm:text-2xl">
              - {rupiah(data.totalCost)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.realCostItemsCount} item HPP riil ({data.totalItemsCount} total)
            </p>
          </div>

          {/* Pillar 3: Gross Profit */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              3. Gross Profit (Laba Kotor)
            </p>
            <p className="mt-2 font-mono text-xl font-extrabold text-emerald-400 sm:text-2xl">
              = {rupiah(data.grossProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Omzet − Modal HPP
            </p>
          </div>

          {/* Pillar 4: Pengeluaran Operasional */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              4. Pengeluaran Operasional
            </p>
            <p className="mt-2 font-mono text-xl font-extrabold text-rose-400 sm:text-2xl">
              - {rupiah(data.totalExpenses)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.expensesCount} biaya approved
            </p>
          </div>

          {/* Pillar 5: Nett Profit */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 sm:col-span-2 lg:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              5. Nett Profit (Laba Bersih)
            </p>
            <p
              className={`mt-2 font-mono text-xl font-extrabold sm:text-2xl ${
                data.nettProfit >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              = {rupiah(data.nettProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Gross Profit − Pengeluaran
            </p>
          </div>
        </div>
      </div>

      {/* 2. Tab Switcher & Global Expand/Collapse Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === "sales"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Sumber Penjualan ({data.sales.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expenses")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === "expenses"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Sumber Pengeluaran ({data.expenses.length})</span>
          </button>
        </div>

        {activeTab === "sales" && data.sales.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAllCurrent}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>{isAllPagedExpanded ? "Tutup Semua" : "Buka Semua di Halaman Ini"}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Content View: Sales Accordion Table */}
      {activeTab === "sales" && (
        <div className="aj-surface overflow-hidden">
          {data.sales.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="font-semibold text-slate-700">Tidak ada transaksi penjualan operasional</p>
              <p className="text-xs text-slate-400 mt-1">Sesuaikan filter tanggal atau bulan di atas untuk melihat data lainnya.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-3 w-10 text-center"></th>
                    <th className="py-3 px-3">Tanggal</th>
                    <th className="py-3 px-3">No. Transaksi</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Tipe & Pembayaran</th>
                    <th className="py-3 px-3 text-right">Omzet Jual</th>
                    <th className="py-3 px-3 text-right">Modal HPP</th>
                    <th className="py-3 px-3 text-right">Gross Profit</th>
                    <th className="py-3 px-3 text-center">Margin %</th>
                    <th className="py-3 px-3 text-center w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedSales.map((sale) => (
                    <SaleRowItem
                      key={sale.id}
                      sale={sale}
                      isExpanded={expandedSaleIds.has(sale.id)}
                      onToggle={() => toggleSale(sale.id)}
                      fallbackPercent={data.fallbackMarginPercent}
                    />
                  ))}
                </tbody>
              </table>

              {/* Sales Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-slate-600 sm:text-sm">
                <div>
                  <span>
                    Menampilkan <b className="text-slate-900">{salesStart + 1}</b> -{" "}
                    <b className="text-slate-900">{salesEnd}</b> dari{" "}
                    <b className="text-slate-900">{totalSales}</b> transaksi (Halaman {curSalesPage} dari {totalSalesPages})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={curSalesPage <= 1}
                    onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={curSalesPage >= totalSalesPages}
                    onClick={() => setSalesPage((p) => Math.min(totalSalesPages, p + 1))}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Content View: Expenses Table */}
      {activeTab === "expenses" && (
        <div className="aj-surface overflow-hidden">
          {data.expenses.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-semibold text-slate-700">Tidak ada data pengeluaran operasional</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada pengeluaran operasional approved pada periode yang dipilih.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-3.5">Tanggal</th>
                    <th className="py-3 px-3.5">Kategori</th>
                    <th className="py-3 px-3.5">Vendor / Penerima</th>
                    <th className="py-3 px-3.5">Deskripsi</th>
                    <th className="py-3 px-3.5">Rekening</th>
                    <th className="py-3 px-3.5 text-right">Nominal Beban</th>
                    <th className="py-3 px-3.5 text-center w-24">Bukti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-3.5 font-mono text-xs text-slate-600">
                        {expense.expenseDate}
                      </td>
                      <td className="py-3.5 px-3.5">
                        <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {expense.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 font-bold text-slate-900">
                        {expense.vendorName}
                      </td>
                      <td className="py-3.5 px-3.5 max-w-xs text-xs text-slate-600 truncate" title={expense.description}>
                        {expense.description}
                      </td>
                      <td className="py-3.5 px-3.5 text-xs text-slate-600">
                        {expense.rekeningNameSnapshot || "-"}
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-mono font-bold text-rose-600">
                        {rupiah(expense.amount)}
                      </td>
                      <td className="py-3.5 px-3.5 text-center">
                        {expense.attachmentUrl ? (
                          <a
                            href={expense.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <span>Struk</span>
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Expenses Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-slate-600 sm:text-sm">
                <div>
                  <span>
                    Menampilkan <b className="text-slate-900">{expensesStart + 1}</b> -{" "}
                    <b className="text-slate-900">{expensesEnd}</b> dari{" "}
                    <b className="text-slate-900">{totalExpenses}</b> pengeluaran (Halaman {curExpensesPage} dari {totalExpensesPages})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={curExpensesPage <= 1}
                    onClick={() => setExpensesPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={curExpensesPage >= totalExpensesPages}
                    onClick={() => setExpensesPage((p) => Math.min(totalExpensesPages, p + 1))}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SaleRowItem({
  sale,
  isExpanded,
  onToggle,
  fallbackPercent,
}: {
  sale: ProfitDetailSale;
  isExpanded: boolean;
  onToggle: () => void;
  fallbackPercent: number;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${
          isExpanded ? "bg-emerald-50/40" : "hover:bg-slate-50/80"
        }`}
        onClick={onToggle}
      >
        <td className="py-3.5 pl-4 pr-2 text-slate-400 text-center">
          <button
            type="button"
            className="p-1 hover:text-slate-700"
            aria-label="Toggle details"
          >
            {isExpanded ? (
              <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </td>
        <td className="px-3 py-3.5 font-mono text-xs text-slate-600">{sale.saleDate}</td>
        <td className="px-3 py-3.5 font-bold text-slate-950">{sale.transactionNumber || sale.id}</td>
        <td className="px-3 py-3.5 text-slate-800 font-medium">{sale.customerName || "Walk-In"}</td>
        <td className="px-3 py-3.5 text-xs text-slate-600">
          <span className="font-bold text-emerald-700">{sale.tipeCode}</span> • {sale.rekeningNameSnapshot || sale.paymentMethod}
        </td>
        <td className="px-3 py-3.5 text-right font-mono font-bold text-slate-950">{rupiah(sale.revenue)}</td>
        <td className="px-3 py-3.5 text-right font-mono font-semibold text-amber-700">{rupiah(sale.cost)}</td>
        <td className="px-3 py-3.5 text-right font-mono font-bold text-emerald-700">{rupiah(sale.grossProfit)}</td>
        <td className="px-3 py-3.5 text-center">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
              sale.hasRealCost ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
            }`}
            title={sale.hasRealCost ? "Dihitung dari HPP real master produk" : `Estimasi margin global ${fallbackPercent}%`}
          >
            {sale.marginPercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
          </span>
        </td>
        <td className="py-3.5 pl-2 pr-4 text-center">
          <Link
            href={`/penjualan/${encodeURIComponent(sale.id)}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <span>Lihat</span>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </td>
      </tr>

      {/* Expanded Item Breakdown Subtable */}
      {isExpanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={10} className="p-4 pl-12">
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Rincian Item Produk dalam Transaksi ({sale.items.length} Item)
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Total Jual: <strong className="text-slate-900 font-mono">{rupiah(sale.revenue)}</strong></span>
                  <span>•</span>
                  <span>Total Modal: <strong className="text-amber-700 font-mono">{rupiah(sale.cost)}</strong></span>
                  <span>•</span>
                  <span>Laba Kotor: <strong className="text-emerald-700 font-mono">{rupiah(sale.grossProfit)}</strong></span>
                </div>
              </div>

              {sale.items.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Tidak ada detail item pada transaksi ini (menggunakan nilai total nota secara global).
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="border-b border-slate-200 bg-slate-100/80 font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Barang / SKU</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Harga Jual Satuan</th>
                        <th className="px-3 py-2 text-right">HPP Modal Satuan</th>
                        <th className="px-3 py-2 text-right">Diskon</th>
                        <th className="px-3 py-2 text-right">Subtotal Jual</th>
                        <th className="px-3 py-2 text-right">Subtotal Modal</th>
                        <th className="px-3 py-2 text-right">Laba Kotor</th>
                        <th className="px-3 py-2 text-center">Status HPP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {sale.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 font-sans">
                          <td className="px-3 py-2.5 font-bold text-slate-950 font-sans">{it.productRef}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-900">{it.quantity}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-800">{rupiah(it.unitPrice)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                            {it.costPrice != null ? (
                              rupiah(it.costPrice)
                            ) : (
                              <span className="text-slate-400 italic font-sans">Global Fallback</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-500 font-sans">
                            {it.discount > 0 ? rupiah(it.discount) : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-950">{rupiah(it.revenue)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-amber-700">{rupiah(it.cost)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{rupiah(it.grossProfit)}</td>
                          <td className="px-3 py-2.5 text-center font-sans">
                            {it.isRealCost ? (
                              <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Real HPP
                              </span>
                            ) : (
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                Fallback {fallbackPercent}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
