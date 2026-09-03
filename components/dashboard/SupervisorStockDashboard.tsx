"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StockReportItem } from "@/lib/reports/stockReports";

type Props = {
  userName: string;
  stockItems: StockReportItem[];
  warehouses: string[];
};

const rupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(val);

export function SupervisorStockDashboard({
  userName,
  stockItems,
  warehouses
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL_CRITICAL" | "OUT_OF_STOCK" | "LOW_STOCK">("ALL_CRITICAL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Compute metrics
  const outOfStockList = useMemo(
    () => stockItems.filter((it) => it.quantity <= 0),
    [stockItems]
  );

  const lowStockList = useMemo(
    () => stockItems.filter((it) => it.quantity > 0 && it.quantity <= it.minStock),
    [stockItems]
  );

  const criticalItems = useMemo(
    () => stockItems.filter((it) => it.quantity <= it.minStock || it.quantity <= 0),
    [stockItems]
  );

  const totalCriticalValuation = useMemo(
    () => criticalItems.reduce((acc, it) => acc + (it.costPrice * Math.max(0, it.quantity)), 0),
    [criticalItems]
  );

  // Filtered critical items for the table
  const filteredItems = useMemo(() => {
    let list = criticalItems;

    if (statusFilter === "OUT_OF_STOCK") {
      list = list.filter((it) => it.quantity <= 0);
    } else if (statusFilter === "LOW_STOCK") {
      list = list.filter((it) => it.quantity > 0 && it.quantity <= it.minStock);
    }

    if (selectedWarehouse) {
      list = list.filter((it) => it.warehouse === selectedWarehouse);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (it) =>
          it.productName.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q)
      );
    }

    return list;
  }, [criticalItems, statusFilter, selectedWarehouse, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Supervisor Dashboard
              </span>
              <span className="text-xs text-slate-500">
                • Pemantauan Ketersediaan Stok
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Selamat Datang, {userName}
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm max-w-2xl">
              Fokus pemantauan produk yang stoknya habis atau menipis di seluruh gudang untuk memastikan kelancaran operasional.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/barang"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer sm:text-sm"
            >
              Buka Master Stok Barang
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Operasional Shortcuts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href="/penjualan/input"
          className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm"
        >
          <div className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
            Input Penjualan
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Catat transaksi kasir</p>
        </Link>

        <Link
          href="/pengeluaran/input"
          className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm"
        >
          <div className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
            Input Pengeluaran
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Catat biaya operasional</p>
        </Link>

        <Link
          href="/tempo"
          className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm"
        >
          <div className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
            Tempo & Piutang
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Pantau jatuh tempo</p>
        </Link>

        <Link
          href="/approval"
          className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm"
        >
          <div className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
            Approval Transaksi
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Persetujuan transaksi</p>
        </Link>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
            Stok Habis (0 Unit)
          </p>
          <p className="mt-1 text-2xl font-black text-rose-950 sm:text-3xl">
            {outOfStockList.length} Item
          </p>
          <p className="mt-1 text-xs text-rose-600">
            Stok fisik kosong di gudang
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Stok Menipis (Warning)
          </p>
          <p className="mt-1 text-2xl font-black text-amber-950 sm:text-3xl">
            {lowStockList.length} Item
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Stok &le; batas minimum
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Item Dipantau
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
            {stockItems.length} Produk
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Total seluruh SKU di database
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Valuasi Barang Kritis
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-950 sm:text-3xl">
            {rupiah(totalCriticalValuation)}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Nilai modal stok tersisa
          </p>
        </div>
      </div>

      {/* Main Table Card: Daftar Barang Stok Darurat */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Daftar Produk Stok Habis & Menipis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Segera koordinasikan dengan tim pembelian atau gudang untuk barang yang berstatus darurat.
              </p>
            </div>

            <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              Ditemukan: <b>{filteredItems.length}</b> barang
            </span>
          </div>

          {/* Filter Toolbar */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
            {/* Search Input */}
            <div className="relative sm:col-span-6">
              <input
                type="text"
                placeholder="Cari nama barang atau kode SKU..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Warehouse Filter */}
            <div className="sm:col-span-6">
              <select
                value={selectedWarehouse}
                onChange={(e) => {
                  setSelectedWarehouse(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">Semua Lokasi Gudang</option>
                {warehouses.map((wh) => (
                  <option key={wh} value={wh}>
                    Gudang: {wh}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter Buttons */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600 border-t border-slate-200/70 pt-3">
            <span>Filter Status:</span>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("ALL_CRITICAL");
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                statusFilter === "ALL_CRITICAL"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
              }`}
            >
              Semua Darurat ({criticalItems.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("OUT_OF_STOCK");
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                statusFilter === "OUT_OF_STOCK"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Habis Total ({outOfStockList.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("LOW_STOCK");
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                statusFilter === "LOW_STOCK"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              Stok Menipis ({lowStockList.length})
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3 text-center w-12">No</th>
                <th className="px-4 py-3">Produk & SKU</th>
                <th className="px-4 py-3">Lokasi Gudang</th>
                <th className="px-4 py-3 text-center">Stok Saat Ini</th>
                <th className="px-4 py-3 text-center">Batas Min</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Harga Modal</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.map((item, idx) => {
                const isOutOfStock = item.quantity <= 0;
                return (
                  <tr
                    key={`${item.productId}-${item.warehouse}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-4 py-3 text-center font-bold text-slate-500">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 text-sm">
                        {item.productName}
                      </div>
                      <div className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                        {item.sku}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {item.warehouse || "-"}
                      {item.rack ? (
                        <span className="text-slate-400 block text-[11px]">Rak: {item.rack}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-sm font-black ${
                          isOutOfStock ? "text-rose-700" : "text-amber-700"
                        }`}
                      >
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-600">
                      {item.minStock} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                          isOutOfStock
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isOutOfStock ? "Habis" : "Menipis"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {rupiah(item.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/stok-barang/${encodeURIComponent(item.productId || item.sku)}`}
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                      >
                        Detail Stok →
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {paginatedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    Tidak ada barang yang berstatus habis atau menipis dengan kriteria yang dipilih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredItems.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>Menampilkan</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>
                dari <b>{filteredItems.length}</b> barang (Hal. {page} dari {totalPages})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sebelumnya
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (page > 3) {
                    pageNum = Math.min(totalPages - 4 + i, page - 2 + i);
                  }
                }
                if (pageNum <= 0 || pageNum > totalPages) return null;
                return (
                  <button
                    key={`page-${pageNum}`}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      page === pageNum
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
