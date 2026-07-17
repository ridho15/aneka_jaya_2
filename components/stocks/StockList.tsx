"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import type { StockItem } from "@/lib/types/stock";
import type { StockPageMeta } from "@/lib/api/stocks";
import { stockDetailHref } from "@/lib/stocks/detail";

const dash = "—";
const formatNumber = (value: number | null | undefined) => value === null || value === undefined ? dash : new Intl.NumberFormat("id-ID").format(value);
const timeLabel = () => new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date());

function warningBadge(stock: StockItem) {
  const warnings = stock.dataQualityWarnings ?? [];
  if (warnings.length === 0) return null;
  return <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700" title={warnings.join(", ")}>Data ERP tidak lengkap</span>;
}

type StockFilters = {
  keyword?: string;
  productId?: string;
  sku?: string;
  warehouse?: string;
};

function buildQuery(filters: StockFilters, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.sku) params.set("sku", filters.sku);
  if (filters.warehouse) params.set("warehouse", filters.warehouse);
  return params.toString();
}

function pageHref(filters: StockFilters, page: number, pageSize: number) {
  return `/stok-barang?${buildQuery(filters, page, pageSize)}`;
}

export function StockList({ initialStocks, initialMeta, initialFilters = {} }: { initialStocks: StockItem[]; initialMeta: StockPageMeta; initialFilters?: StockFilters }) {
  const [stocks, setStocks] = useState(initialStocks);
  const [meta, setMeta] = useState(initialMeta);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [updated, setUpdated] = useState(timeLabel());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshController = useRef<AbortController | null>(null);
  const refreshingRef = useRef(false);
  const activeFiltersKey = JSON.stringify([
    initialFilters.keyword || "",
    initialFilters.productId || "",
    initialFilters.sku || "",
    initialFilters.warehouse || ""
  ]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStocks(initialStocks);
      setMeta(initialMeta);
      setDraftFilters(initialFilters);
      setUpdated(timeLabel());
      setSyncError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeFiltersKey, initialFilters, initialMeta, initialStocks]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const controller = new AbortController();
    refreshController.current = controller;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/stocks?${buildQuery(initialFilters, initialMeta.page, initialMeta.pageSize)}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (response.ok && result?.success) {
        setStocks(Array.isArray(result.data) ? result.data : result.data?.data ?? []);
        if (result.meta) setMeta(result.meta);
        setUpdated(timeLabel());
        setSyncError(null);
      } else {
        setSyncError(result?.message || "Refresh stok ERP gagal. Menampilkan data valid terakhir.");
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
      setSyncError("Refresh stok ERP gagal karena koneksi bermasalah. Menampilkan data valid terakhir.");
    } finally {
      if (refreshController.current === controller) {
        refreshController.current = null;
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }
  }, [initialFilters, initialMeta.page, initialMeta.pageSize]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await refresh();
        if (!cancelled) schedule();
      }, 30_000);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      refreshController.current?.abort();
      refreshController.current = null;
      refreshingRef.current = false;
    };
  }, [refresh]);

  const shown = useMemo(() => stocks, [stocks]);
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);

  const currentListHref = pageHref(initialFilters, meta.page, meta.pageSize);
  const activeFilters = [
    initialFilters.keyword ? `Keyword: ${initialFilters.keyword}` : null,
    initialFilters.productId ? `Product ID: ${initialFilters.productId}` : null,
    initialFilters.sku ? `SKU: ${initialFilters.sku}` : null,
    initialFilters.warehouse ? `Gudang: ${initialFilters.warehouse}` : null
  ].filter(Boolean) as string[];

  return <section className="aj-surface overflow-hidden">
    <div className="border-b border-slate-100">
      <ResponsiveFilterPanel
        title="Filter stok"
        resetHref="/stok-barang"
        activeFilters={activeFilters}
        emptyText="Filter aktif: semua stok."
        formClassName="grid gap-3 md:grid-cols-5"
        surface={false}
      >
        <label className="text-sm font-medium text-slate-700">Keyword<Input name="keyword" className="mt-1" placeholder="Kode, nama, gudang, rak" value={draftFilters.keyword || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))} /></label>
        <label className="text-sm font-medium text-slate-700">Product ID<Input name="productId" className="mt-1" value={draftFilters.productId || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, productId: event.target.value }))} /></label>
        <label className="text-sm font-medium text-slate-700">SKU<Input name="sku" className="mt-1" value={draftFilters.sku || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, sku: event.target.value }))} /></label>
        <label className="text-sm font-medium text-slate-700">Gudang<Input name="warehouse" className="mt-1" value={draftFilters.warehouse || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, warehouse: event.target.value }))} /></label>
      </ResponsiveFilterPanel>
      <div className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-slate-500">Menampilkan {start}-{end} dari {meta.total} stok. Sinkron otomatis tiap 30 detik - terakhir berhasil {updated}</p>
        <Button type="button" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refresh..." : "Refresh ERP"}</Button>
      </div>
      {syncError && <p className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 sm:mx-6">Refresh gagal, memakai data terakhir. {syncError}</p>}
    </div>
    <div className="space-y-3 p-4 md:hidden">{shown.map((stock) => {
    const shouldAlert = stock.isLowStock ?? (stock.quantity !== null && stock.minimumStock !== null && stock.minimumStock !== undefined && stock.minimumStock > 0 && stock.quantity <= stock.minimumStock);
    return <article key={stock.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-emerald-700">{stock.productCode}</p><h3 className="mt-1 font-semibold text-slate-900">{stock.productName}</h3>{warningBadge(stock)}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${shouldAlert ? "bg-red-50 text-red-700" : stock.quantity === null ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{formatNumber(stock.quantity)}</span></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gudang</dt><dd className="mt-0.5">{stock.warehouse ?? dash}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rak</dt><dd className="mt-0.5">{stock.rack || dash}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Free / On hand</dt><dd className="mt-0.5">{formatNumber(stock.freeQuantity)} / {formatNumber(stock.onHandQuantity)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Minimum</dt><dd className="mt-0.5">{formatNumber(stock.minimumStock)}</dd></div></dl><Link className="mt-4 block rounded-sm bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700" href={stockDetailHref({ id: stock.id, productId: stock.productId, sku: stock.productCode }, currentListHref)}>Detail</Link></article>;
  })}{shown.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada data stok yang sesuai.</p>}</div><div className="hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama barang</th><th className="px-5 py-3">Gudang</th><th className="px-5 py-3">Rak</th><th className="px-5 py-3 text-right">Qty tersedia</th><th className="px-5 py-3 text-right">Free</th><th className="px-5 py-3 text-right">On hand</th><th className="px-5 py-3 text-right">Reserved</th><th className="px-5 py-3 text-right">Minimum</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Satuan</th><th className="px-5 py-3 text-right">Aksi</th></tr></thead><tbody>{shown.map((stock) => {
    const shouldAlert = stock.isLowStock ?? (stock.quantity !== null && stock.minimumStock !== null && stock.minimumStock !== undefined && stock.minimumStock > 0 && stock.quantity <= stock.minimumStock);
    return <tr key={stock.id} className="border-b border-slate-100"><td className="px-5 py-4 font-semibold text-slate-800">{stock.productCode}</td><td className="px-5 py-4">{stock.productName}{warningBadge(stock)}</td><td className="px-5 py-4">{stock.warehouse ?? dash}</td><td className="px-5 py-4">{stock.rack || dash}</td><td className="px-5 py-4 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${shouldAlert ? "bg-red-50 text-red-700" : stock.quantity === null ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{formatNumber(stock.quantity)}</span></td><td className="px-5 py-4 text-right">{formatNumber(stock.freeQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.onHandQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.reservedQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.minimumStock)}</td><td className="px-5 py-4">{stock.ready === null || stock.ready === undefined ? dash : stock.ready ? "Ready" : "Tidak ready"}</td><td className="px-5 py-4 text-slate-600">{stock.unit ?? dash}</td><td className="px-5 py-4 text-right"><Link className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline" href={stockDetailHref({ id: stock.id, productId: stock.productId, sku: stock.productCode }, currentListHref)}>Detail</Link></td></tr>;
  })}{shown.length === 0 && <tr><td colSpan={12} className="px-5 py-9 text-center text-slate-500">Tidak ada data stok yang sesuai.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm"><span className="text-slate-500">Halaman {meta.page} dari {meta.totalPages}</span><div className="flex gap-2">{meta.page > 1 && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(initialFilters, meta.page - 1, meta.pageSize)}>Sebelumnya</Link>}{meta.page < meta.totalPages && <Link className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50" href={pageHref(initialFilters, meta.page + 1, meta.pageSize)}>Berikutnya</Link>}</div></div></section>;
}
