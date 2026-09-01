"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InventoryAiForecastResult } from "@/lib/ai/inventoryForecast";

type Props = {
  initialData: InventoryAiForecastResult;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

export function AiInventoryForecastView({ initialData }: Props) {
  const [data, setData] = useState<InventoryAiForecastResult>(initialData);
  const [activeTab, setActiveTab] = useState<"reorder" | "deadstock" | "podraft">("reorder");

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [filterUrgency, setFilterUrgency] = useState<"ALL" | "CRITICAL" | "WARNING">("ALL");
  const [deadStockDaysFilter, setDeadStockDaysFilter] = useState<"ALL" | "30" | "60" | "90">("ALL");
  const [sortByReorder, setSortByReorder] = useState<"CRITICAL" | "BUDGET" | "VELOCITY" | "NAME">("CRITICAL");
  const [sortByDeadStock, setSortByDeadStock] = useState<"CAPITAL" | "DAYS" | "NAME">("CAPITAL");

  // Pagination States
  const [reorderPage, setReorderPage] = useState(1);
  const [reorderPageSize, setReorderPageSize] = useState(10);
  const [deadStockPage, setDeadStockPage] = useState(1);
  const [deadStockPageSize, setDeadStockPageSize] = useState(6);

  // Interaction States
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPo, setCopiedPo] = useState(false);

  // Extract unique warehouses
  const availableWarehouses = useMemo(() => {
    const set = new Set<string>();
    data.reorderRecommendations.forEach((r) => r.warehouse && set.add(r.warehouse));
    data.deadStockOptimizations.forEach((d) => d.warehouse && set.add(d.warehouse));
    return Array.from(set).sort();
  }, [data]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/inventory-forecast?force=true");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Gagal memperbarui prediksi inventaris:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered & Sorted Reorders
  const filteredReorders = useMemo(() => {
    let list = data.reorderRecommendations.filter((item) => {
      if (filterUrgency !== "ALL" && item.urgency !== filterUrgency) return false;
      if (selectedWarehouse && item.warehouse !== selectedWarehouse) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.productName.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchWh = item.warehouse.toLowerCase().includes(q);
        const matchReason = item.reasoning.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchWh && !matchReason) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortByReorder === "CRITICAL") {
        const rank = { CRITICAL: 1, WARNING: 2, SAFE: 3 };
        if (rank[a.urgency] !== rank[b.urgency]) {
          return rank[a.urgency] - rank[b.urgency];
        }
        return a.daysUntilStockout - b.daysUntilStockout;
      }
      if (sortByReorder === "BUDGET") {
        return b.estimatedReorderCost - a.estimatedReorderCost;
      }
      if (sortByReorder === "VELOCITY") {
        return b.dailyVelocity - a.dailyVelocity;
      }
      if (sortByReorder === "NAME") {
        return a.productName.localeCompare(b.productName, "id-ID");
      }
      return 0;
    });

    return list;
  }, [data.reorderRecommendations, filterUrgency, selectedWarehouse, searchQuery, sortByReorder]);

  const totalReorderPages = Math.max(1, Math.ceil(filteredReorders.length / reorderPageSize));
  const paginatedReorders = useMemo(() => {
    const start = (reorderPage - 1) * reorderPageSize;
    return filteredReorders.slice(start, start + reorderPageSize);
  }, [filteredReorders, reorderPage, reorderPageSize]);

  // Filtered & Sorted Dead Stock
  const filteredDeadStocks = useMemo(() => {
    let list = data.deadStockOptimizations.filter((item) => {
      if (deadStockDaysFilter === "30" && item.daysWithoutSale < 30) return false;
      if (deadStockDaysFilter === "60" && item.daysWithoutSale < 60) return false;
      if (deadStockDaysFilter === "90" && item.daysWithoutSale < 90) return false;
      if (selectedWarehouse && item.warehouse !== selectedWarehouse) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.productName.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchWh = item.warehouse.toLowerCase().includes(q);
        const matchAction = item.actionStrategy.toLowerCase().includes(q);
        const matchBundle = item.suggestedBundlingWith?.bundleStrategy.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchWh && !matchAction && !matchBundle) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortByDeadStock === "CAPITAL") {
        return b.tiedUpCapital - a.tiedUpCapital;
      }
      if (sortByDeadStock === "DAYS") {
        return b.daysWithoutSale - a.daysWithoutSale;
      }
      if (sortByDeadStock === "NAME") {
        return a.productName.localeCompare(b.productName, "id-ID");
      }
      return 0;
    });

    return list;
  }, [data.deadStockOptimizations, deadStockDaysFilter, selectedWarehouse, searchQuery, sortByDeadStock]);

  const totalDeadStockPages = Math.max(1, Math.ceil(filteredDeadStocks.length / deadStockPageSize));
  const paginatedDeadStocks = useMemo(() => {
    const start = (deadStockPage - 1) * deadStockPageSize;
    return filteredDeadStocks.slice(start, start + deadStockPageSize);
  }, [filteredDeadStocks, deadStockPage, deadStockPageSize]);

  const handleCopyPo = () => {
    navigator.clipboard.writeText(data.supplierPoDraft);
    setCopiedPo(true);
    setTimeout(() => setCopiedPo(false), 2500);
  };

  const handleCopyExecutiveSummary = () => {
    navigator.clipboard.writeText(data.executiveSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const waShareUrl = `https://wa.me/?text=${encodeURIComponent(data.supplierPoDraft)}`;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:p-7">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Intelligence Engine
            </span>
            <span className="text-xs text-slate-500">
              • Diperbarui {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(data.generatedAt))}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            AI Inventory & Supply Chain Intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
            Prediksi kebutuhan restock barang, deteksi stok menumpuk (*dead stock*), dan rekomendasi strategi *bundling* otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer sm:text-sm"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            {loading ? "Menganalisis..." : "Perbarui Analisis AI"}
          </button>

          <Link
            href="/barang"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 sm:text-sm"
          >
            ← Kembali ke Stok
          </Link>
        </div>
      </div>

      {/* AI Executive Summary Card */}
      <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-emerald-200/70 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h3 className="font-bold text-emerald-950 text-sm sm:text-base">Ringkasan Eksekutif Inventaris AI</h3>
          </div>
          <button
            type="button"
            onClick={handleCopyExecutiveSummary}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            {copied ? "✅ Tersalin!" : "📋 Salin Ringkasan"}
          </button>
        </div>
        <p className="text-xs text-slate-700 sm:text-sm leading-relaxed font-medium">
          {data.executiveSummary}
        </p>
      </div>

      {/* Navigation Tabs - Consistent Primary Emerald Styling */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("reorder");
            setReorderPage(1);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "reorder"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>🚨</span>
          <span>Prediksi Restock ({data.summary.criticalReorderCount + data.summary.warningReorderCount})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("deadstock");
            setDeadStockPage(1);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "deadstock"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>📦</span>
          <span>Dead Stock & Bundling ({data.summary.deadStockItemCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("podraft")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "podraft"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>📝</span>
          <span>Draf PO Supplier (WhatsApp)</span>
        </button>
      </div>

      {/* TAB 1: REORDER RECOMMENDATIONS */}
      {activeTab === "reorder" && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Kritis (0-3 Hari)</p>
              <p className="mt-1 text-2xl font-black text-rose-950 sm:text-3xl">
                {data.summary.criticalReorderCount} Item
              </p>
              <p className="mt-1 text-xs text-slate-500">Stok mendekati nol / habis</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Waspada (4-7 Hari)</p>
              <p className="mt-1 text-2xl font-black text-amber-950 sm:text-3xl">
                {data.summary.warningReorderCount} Item
              </p>
              <p className="mt-1 text-xs text-slate-500">Perlu reorder minggu ini</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Estimasi Anggaran Restock</p>
              <p className="mt-1 text-2xl font-black text-emerald-950 sm:text-3xl">
                {rupiah(data.summary.estimatedRestockBudget)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Estimasi total modal untuk kuantitas yang direkomendasikan</p>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {/* Search Bar */}
              <div className="relative md:col-span-5">
                <input
                  type="text"
                  placeholder="Cari nama barang, SKU, gudang..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setReorderPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-8"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setReorderPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Warehouse Filter */}
              <div className="md:col-span-3">
                <select
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setReorderPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">Semua Lokasi Gudang</option>
                  {availableWarehouses.map((wh) => (
                    <option key={wh} value={wh}>
                      Gudang: {wh}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sorting Selector */}
              <div className="md:col-span-4">
                <select
                  value={sortByReorder}
                  onChange={(e) => setSortByReorder(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="CRITICAL">Urutkan: Paling Kritis (Sisa Hari Terkecil)</option>
                  <option value="BUDGET">Urutkan: Estimasi Modal Terbesar (Rp)</option>
                  <option value="VELOCITY">Urutkan: Laju Penjualan Tertinggi</option>
                  <option value="NAME">Urutkan: Nama Produk (A–Z)</option>
                </select>
              </div>
            </div>

            {/* Urgency Quick Buttons & Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span>Filter Urgensi:</span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterUrgency("ALL");
                    setReorderPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    filterUrgency === "ALL"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Semua ({data.reorderRecommendations.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterUrgency("CRITICAL");
                    setReorderPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    filterUrgency === "CRITICAL"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  🔴 Kritis ({data.summary.criticalReorderCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterUrgency("WARNING");
                    setReorderPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    filterUrgency === "WARNING"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  🟡 Waspada ({data.summary.warningReorderCount})
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Ditemukan: <b>{filteredReorders.length}</b> data
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab("podraft")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  📄 Buat Draf PO Supplier →
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3.5">Produk & Lokasi</th>
                    <th className="px-4 py-3.5 text-center">Stok Saat Ini</th>
                    <th className="px-4 py-3.5 text-center">Laju Penjualan</th>
                    <th className="px-4 py-3.5 text-center">Sisa Hari</th>
                    <th className="px-4 py-3.5 text-right text-rose-700">Saran Reorder</th>
                    <th className="px-4 py-3.5 text-right">Estimasi Modal</th>
                    <th className="px-4 py-3.5">Analisis AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedReorders.map((item, idx) => (
                    <tr key={`${item.sku}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-sm">{item.productName}</div>
                        <div className="flex items-center gap-2 text-slate-500 mt-0.5">
                          <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.sku}
                          </span>
                          <span>Gudang: {item.warehouse || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-extrabold text-slate-900 text-sm">
                          {item.currentStock} {item.unit}
                        </span>
                        <div className="text-[10px] text-slate-400">Min: {item.minStock}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700">
                        <b>{item.dailyVelocity}</b> {item.unit}/hari
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                            item.urgency === "CRITICAL"
                              ? "bg-rose-100 text-rose-800"
                              : item.urgency === "WARNING"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {item.daysUntilStockout <= 0
                            ? "⛔ Habis"
                            : `${item.daysUntilStockout} Hari`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-extrabold text-rose-700 text-sm">
                          +{item.recommendedReorderQty} {item.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {rupiah(item.estimatedReorderCost)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs">
                        <p className="line-clamp-2 text-[11px] leading-tight">{item.reasoning}</p>
                      </td>
                    </tr>
                  ))}
                  {paginatedReorders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        Tidak ada barang dengan kriteria filter atau pencarian yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredReorders.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Menampilkan</span>
                  <select
                    value={reorderPageSize}
                    onChange={(e) => {
                      setReorderPageSize(Number(e.target.value));
                      setReorderPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>
                    dari <b>{filteredReorders.length}</b> data (Hal. {reorderPage} dari {totalReorderPages})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReorderPage((p) => Math.max(1, p - 1))}
                    disabled={reorderPage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  {Array.from({ length: Math.min(5, totalReorderPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalReorderPages > 5) {
                      if (reorderPage > 3) {
                        pageNum = Math.min(totalReorderPages - 4 + i, reorderPage - 2 + i);
                      }
                    }
                    if (pageNum <= 0 || pageNum > totalReorderPages) return null;
                    return (
                      <button
                        key={`reorder-page-${pageNum}`}
                        type="button"
                        onClick={() => setReorderPage(pageNum)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                          reorderPage === pageNum
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
                    onClick={() => setReorderPage((p) => Math.min(totalReorderPages, p + 1))}
                    disabled={reorderPage === totalReorderPages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DEAD STOCK & BUNDLING OPTIMIZER */}
      {activeTab === "deadstock" && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Item Dead Stock</p>
              <p className="mt-1 text-2xl font-black text-amber-950 sm:text-3xl">
                {data.summary.deadStockItemCount} Produk
              </p>
              <p className="mt-1 text-xs text-slate-500">Tidak ada penjualan &gt; 30 hari</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Total Modal Tertahan</p>
              <p className="mt-1 text-2xl font-black text-rose-950 sm:text-3xl">
                {rupiah(data.summary.totalTiedUpCapital)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Valuasi dana kas yang mengendap pada barang mati</p>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {/* Search Bar */}
              <div className="relative md:col-span-5">
                <input
                  type="text"
                  placeholder="Cari barang mati, SKU, saran bundling..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDeadStockPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-8"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setDeadStockPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Warehouse Filter */}
              <div className="md:col-span-3">
                <select
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setDeadStockPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">Semua Lokasi Gudang</option>
                  {availableWarehouses.map((wh) => (
                    <option key={wh} value={wh}>
                      Gudang: {wh}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sorting Selector */}
              <div className="md:col-span-4">
                <select
                  value={sortByDeadStock}
                  onChange={(e) => setSortByDeadStock(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="CAPITAL">Urutkan: Modal Tertahan Terbesar (Rp)</option>
                  <option value="DAYS">Urutkan: Hari Tanpa Penjualan Terlama</option>
                  <option value="NAME">Urutkan: Nama Produk (A–Z)</option>
                </select>
              </div>
            </div>

            {/* Inactivity Day Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span>Filter Masa Macet:</span>
                <button
                  type="button"
                  onClick={() => {
                    setDeadStockDaysFilter("ALL");
                    setDeadStockPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    deadStockDaysFilter === "ALL"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Semua ({data.deadStockOptimizations.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeadStockDaysFilter("30");
                    setDeadStockPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    deadStockDaysFilter === "30"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  &gt; 30 Hari
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeadStockDaysFilter("60");
                    setDeadStockPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    deadStockDaysFilter === "60"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  &gt; 60 Hari
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeadStockDaysFilter("90");
                    setDeadStockPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    deadStockDaysFilter === "90"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  &gt; 90 Hari (Macet Total)
                </button>
              </div>

              <span className="text-xs text-slate-500 font-medium">
                Ditemukan: <b>{filteredDeadStocks.length}</b> produk
              </span>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {paginatedDeadStocks.map((item, idx) => (
              <div
                key={`${item.sku}-${idx}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md space-y-3"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                      {item.sku}
                    </span>
                    <h4 className="mt-1 font-bold text-slate-900 text-base">{item.productName}</h4>
                    <p className="text-xs text-slate-500">Gudang: {item.warehouse || "-"}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Modal Tertahan:</span>
                    <b className="text-rose-700 font-extrabold text-sm sm:text-base">
                      {rupiah(item.tiedUpCapital)}
                    </b>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Stok: {item.currentStock} {item.unit}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-slate-500 text-[11px] block">Hari Tanpa Penjualan</span>
                    <b className="text-slate-800 font-extrabold text-sm">{item.daysWithoutSale} Hari</b>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-2.5">
                    <span className="text-amber-700 text-[11px] block">Saran Diskon Cuci Gudang</span>
                    <b className="text-amber-900 font-extrabold text-sm">Diskon {item.discountRecommendationPercent}%</b>
                  </div>
                </div>

                {item.suggestedBundlingWith && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <span>💡</span>
                      <span>Rekomendasi Paket Bundling Cerdas</span>
                    </div>
                    <p className="text-emerald-800 font-medium">{item.suggestedBundlingWith.bundleStrategy}</p>
                    <p className="text-[11px] text-emerald-700">
                      Pasangkan dengan produk laris: <b>{item.suggestedBundlingWith.fastMovingName}</b>
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Strategi Eksekusi: </span>
                  {item.actionStrategy}
                </div>
              </div>
            ))}

            {paginatedDeadStocks.length === 0 && (
              <div className="col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-slate-500">
                Tidak ada produk dead stock yang cocok dengan kriteria filter atau pencarian.
              </div>
            )}
          </div>

          {/* Dead Stock Pagination Controls */}
          {filteredDeadStocks.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:px-6">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Menampilkan</span>
                <select
                  value={deadStockPageSize}
                  onChange={(e) => {
                    setDeadStockPageSize(Number(e.target.value));
                    setDeadStockPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
                >
                  <option value={6}>6</option>
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                </select>
                <span>
                  dari <b>{filteredDeadStocks.length}</b> produk (Hal. {deadStockPage} dari {totalDeadStockPages})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDeadStockPage((p) => Math.max(1, p - 1))}
                  disabled={deadStockPage === 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sebelumnya
                </button>

                {Array.from({ length: Math.min(5, totalDeadStockPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalDeadStockPages > 5) {
                    if (deadStockPage > 3) {
                      pageNum = Math.min(totalDeadStockPages - 4 + i, deadStockPage - 2 + i);
                    }
                  }
                  if (pageNum <= 0 || pageNum > totalDeadStockPages) return null;
                  return (
                    <button
                      key={`deadstock-page-${pageNum}`}
                      type="button"
                      onClick={() => setDeadStockPage(pageNum)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                        deadStockPage === pageNum
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
                  onClick={() => setDeadStockPage((p) => Math.min(totalDeadStockPages, p + 1))}
                  disabled={deadStockPage === totalDeadStockPages}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUPPLIER PO DRAFT */}
      {activeTab === "podraft" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">📄 Draf Purchase Order Restock Supplier</h3>
                <p className="text-xs text-slate-500">
                  Teks formal yang dibuat otomatis oleh AI berisi daftar barang darurat siap kirim ke WhatsApp supplier.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPo}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  {copiedPo ? "✅ Tersalin!" : "📋 Salin Teks"}
                </button>

                <a
                  href={waShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  <span>📲</span>
                  <span>Buka WhatsApp</span>
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-emerald-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
              {data.supplierPoDraft}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
