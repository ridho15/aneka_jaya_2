"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ProductListItem } from "@/lib/types/product";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { StockItem } from "@/lib/types/stock";
import { normalizeProductCode } from "@/lib/api/erpMappers";
import { ProductDeactivateButton } from "@/components/products/ProductDeactivateButton";
import type { ProductPageMeta } from "@/lib/api/products";
import { stockDetailHref } from "@/lib/stocks/detail";

const rupiah = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
const dash = "—";
const formatNumber = (value: number | null | undefined) => value === null || value === undefined ? dash : new Intl.NumberFormat("id-ID").format(value);
const formatMoney = (value: number | null | undefined) => value === null || value === undefined ? dash : rupiah(value);

type StockSyncState = {
  status: "success" | "failed" | "stale";
  message?: string;
  updatedAt?: string;
};

function timeLabel(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function qualityWarning(warnings: string[]) {
  if (warnings.length === 0) return null;
  return <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700" title={warnings.join(", ")}>Data ERP tidak lengkap</span>;
}

function stockJoinValues(stock: StockItem) {
  return [stock.productId, stock.productCode].map(normalizeProductCode).filter(Boolean);
}

function buildStockLookup(stocks: StockItem[]) {
  const lookup = new Map<string, StockItem[]>();
  for (const stock of stocks) {
    for (const key of stockJoinValues(stock)) {
      const rows = lookup.get(key) ?? [];
      rows.push(stock);
      lookup.set(key, rows);
    }
  }
  return lookup;
}

function locationSummary(stockRows: StockItem[]) {
  const locations = stockRows.map((stock) => [stock.warehouse, stock.rack].filter(Boolean).join(" / ")).filter(Boolean);
  const unique = Array.from(new Set(locations));
  if (unique.length === 0) return dash;
  if (unique.length <= 2) return unique.join(", ");
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
}

function stocksQueryForProducts(products: ProductListItem[]) {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  const productIds = Array.from(new Set(products.map((item) => item.productId || item.id).filter(Boolean)));
  const skus = Array.from(new Set(products.map((item) => item.code).filter(Boolean)));
  if (productIds.length) params.set("productIds", productIds.join(","));
  if (skus.length) params.set("skus", skus.join(","));
  return params.toString();
}

function productWarnings(item: ProductListItem, stockRows: StockItem[], quantity: number | null, minimum: number | null) {
  const warnings = [...(item.dataQualityWarnings ?? []), ...stockRows.flatMap((stock) => stock.dataQualityWarnings ?? [])];
  if (!item.category) warnings.push("kategori");
  if (item.sellingPrice === null) warnings.push("harga jual");
  if (item.isActive === null) warnings.push("status");
  if (quantity === null) warnings.push("qty");
  if (minimum === null) warnings.push("minimum");
  return Array.from(new Set(warnings));
}

function stockRowsForProduct(item: ProductListItem, stockLookup: Map<string, StockItem[]>) {
  if (item.stockBreakdown?.length) return item.stockBreakdown;
  const productJoinKeys = new Set([normalizeProductCode(item.productId), normalizeProductCode(item.id), normalizeProductCode(item.code)].filter(Boolean));
  const rows = Array.from(productJoinKeys).flatMap((key) => stockLookup.get(key) ?? []);
  return Array.from(new Map(rows.map((stock) => [stock.id, stock])).values());
}

export function ProductList({ products, productMeta, initialKeyword = "", stocks, initialStockError, canManage = false }: { products: ProductListItem[]; productMeta?: ProductPageMeta; initialKeyword?: string; stocks: StockItem[]; initialStockError?: string | null; canManage?: boolean }) {
  const [liveProducts, setLiveProducts] = useState<ProductListItem[]>(products);
  const [liveStocks, setLiveStocks] = useState(stocks);
  const [productPage, setProductPage] = useState<ProductPageMeta>(() => productMeta ?? { page: 1, pageSize: Math.max(products.length, 1), total: products.length, totalPages: 1 });
  const [stockSync, setStockSync] = useState<StockSyncState>(() => initialStockError ? { status: "failed", message: initialStockError } : { status: "success", updatedAt: timeLabel() });
  const [query, setQuery] = useState(initialKeyword);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const didMountSearch = useRef(false);
  const suppressNextSearchRef = useRef(false);
  const liveProductsRef = useRef(products);
  const liveStocksRef = useRef(stocks);
  const pageSizeRef = useRef(productMeta?.pageSize ?? Math.max(products.length, 1));

  useEffect(() => {
    liveProductsRef.current = liveProducts;
  }, [liveProducts]);

  useEffect(() => {
    liveStocksRef.current = liveStocks;
  }, [liveStocks]);

  useEffect(() => {
    pageSizeRef.current = productPage.pageSize;
  }, [productPage.pageSize]);

  const syncUrl = useCallback((page: number, keyword: string, mode: "push" | "replace" = "push") => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    const cleanKeyword = keyword.trim();
    if (cleanKeyword) params.set("keyword", cleanKeyword);
    const href = params.toString() ? `/barang?${params.toString()}` : "/barang";
    if (`${window.location.pathname}${window.location.search}` === href) return;
    if (mode === "replace") window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }, []);

  const refreshStocks = useCallback(async (productsForStock?: ProductListItem[]) => {
    const targetProducts = productsForStock ?? liveProductsRef.current;
    try {
      const stockResponse = await fetch(`/api/stocks?${stocksQueryForProducts(targetProducts)}`, { cache: "no-store" });
      const stockResult = await stockResponse.json().catch(() => null);
      if (stockResponse.ok && stockResult?.success) {
        const nextStocks = Array.isArray(stockResult.data) ? stockResult.data : stockResult.data?.data ?? [];
        liveStocksRef.current = nextStocks;
        setLiveStocks(nextStocks);
        setStockSync({ status: "success", updatedAt: timeLabel() });
      } else {
        setStockSync((previous) => ({
          status: previous.updatedAt || liveStocksRef.current.length > 0 ? "stale" : "failed",
          message: stockResult?.message || "Refresh stok ERP gagal. Menampilkan data valid terakhir bila tersedia.",
          updatedAt: previous.updatedAt
        }));
      }
    } catch {
      setStockSync((previous) => ({
        status: previous.updatedAt || liveStocksRef.current.length > 0 ? "stale" : "failed",
        message: "Refresh ERP gagal karena koneksi bermasalah. Menampilkan data valid terakhir bila tersedia.",
        updatedAt: previous.updatedAt
      }));
    }
  }, []);

  const fetchProducts = useCallback(async (page: number, keyword: string, options: { syncHistory?: boolean; historyMode?: "push" | "replace" } = {}) => {
    setLoadingProducts(true);
    try {
      const search = new URLSearchParams({ page: String(page), pageSize: String(pageSizeRef.current), keyword });
      const response = await fetch(`/api/products?${search.toString()}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success && Array.isArray(result.data?.data) && result.data?.meta) {
        liveProductsRef.current = result.data.data;
        setLiveProducts(result.data.data);
        setProductPage(result.data.meta);
        void refreshStocks(result.data.data);
        if (options.syncHistory) syncUrl(result.data.meta.page, keyword, options.historyMode);
      }
    } finally {
      setLoadingProducts(false);
    }
  }, [refreshStocks, syncUrl]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchProducts(productPage.page, query);
    } finally {
      setRefreshing(false);
    }
  }, [fetchProducts, productPage.page, query]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshStocks(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshStocks]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextKeyword = params.get("keyword") || "";
      const parsedPage = Number(params.get("page") || "1");
      const nextPage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
      suppressNextSearchRef.current = true;
      setQuery(nextKeyword);
      void fetchProducts(nextPage, nextKeyword);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fetchProducts]);

  useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => void fetchProducts(1, query, { syncHistory: true, historyMode: "replace" }), 350);
    return () => window.clearTimeout(timer);
  }, [fetchProducts, query]);

  const stockLookup = useMemo(() => buildStockLookup(liveStocks), [liveStocks]);
  const start = productPage.total === 0 ? 0 : (productPage.page - 1) * productPage.pageSize + 1;
  const end = Math.min(productPage.page * productPage.pageSize, productPage.total);

  return <section className="aj-surface p-5 sm:p-6"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Input className="max-w-md" placeholder="Cari kode atau nama barang" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="grid gap-2 sm:flex sm:flex-wrap"><Button type="button" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refresh..." : "Refresh ERP"}</Button>{canManage && <Link href="/barang/input"><Button className="w-full sm:w-auto">+ Tambah Barang</Button></Link>}</div></div><div className="mb-4 space-y-2"><p className="text-xs text-slate-500">Menampilkan {start}–{end} dari {productPage.total} produk. Quantity disinkronkan dari ERP setiap 30 detik{stockSync.updatedAt ? ` · terakhir berhasil ${stockSync.updatedAt}` : ""}. Auto-refresh hanya memperbarui stok untuk produk halaman aktif; tombol Refresh ERP memperbarui produk + stok.</p>{loadingProducts && <p className="text-xs font-medium text-emerald-700">Memuat produk...</p>}{stockSync.status !== "success" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{stockSync.status === "stale" ? "Refresh stok gagal, memakai data terakhir." : "Stok ERP belum berhasil dimuat."} {stockSync.message}</p>}</div><div className="space-y-3 md:hidden">{liveProducts.map((item) => {
    const stockRows = stockRowsForProduct(item, stockLookup);
    const validQuantities = stockRows.map((stock) => stock.quantity).filter((quantity): quantity is number => typeof quantity === "number" && Number.isFinite(quantity));
    const quantity = item.stockSummary?.quantity ?? (stockSync.status === "failed" || stockRows.length === 0 || validQuantities.length === 0 ? null : validQuantities.reduce((sum, stockQuantity) => sum + stockQuantity, 0));
    const minimum = item.stockSummary?.minimumStock ?? item.minimumStock ?? stockRows.find((stock) => stock.minimumStock !== null && stock.minimumStock !== undefined)?.minimumStock ?? null;
    const unit = item.unit ?? stockRows.find((stock) => Boolean(stock.unit))?.unit ?? null;
    const warnings = productWarnings(item, stockRows, quantity, minimum);
    const shouldAlert = item.stockSummary?.isLowStock ?? stockRows.some((stock) => stock.isLowStock === true) ?? (quantity !== null && minimum !== null && minimum > 0 && quantity <= minimum);
    const ready = stockRows.find((stock) => stock.ready !== null && stock.ready !== undefined)?.ready ?? (quantity === null ? null : quantity > 0);
    return <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-emerald-700">{item.code}</p><h3 className="mt-1 font-semibold text-slate-900">{item.name}</h3>{qualityWarning(warnings)}</div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shouldAlert ? "bg-red-50 text-red-700" : quantity === null ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>{formatNumber(quantity)}</span></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lokasi</dt><dd className="mt-0.5 text-slate-700">{locationSummary(stockRows)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Minimum</dt><dd className="mt-0.5 text-slate-700">{formatNumber(minimum)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Harga jual</dt><dd className="mt-0.5 text-slate-700">{formatMoney(item.sellingPrice)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</dt><dd className="mt-0.5">{ready === null ? dash : ready ? "Ready" : "Tidak ready"} • {unit ?? dash}</dd></div></dl><div className="mt-4 grid gap-2"><Link className="rounded-sm bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700" href={stockDetailHref({ id: item.id, productId: item.productId, sku: item.code }, "/barang")}>Detail stok</Link>{canManage ? <div className="grid grid-cols-2 gap-2"><Link className="rounded-sm border border-blue-200 px-3 py-2 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50" href={`/barang/${item.id}/edit`}>Edit</Link><ProductDeactivateButton id={item.id} disabled={item.isActive === false} /></div> : null}</div></article>;
  })}{liveProducts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada barang yang sesuai.</p>}</div><div className="hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Kode</th><th className="px-3 py-3">Nama barang</th><th className="px-3 py-3">Kategori</th><th className="px-3 py-3">Satuan</th><th className="px-3 py-3">Lokasi ERP</th><th className="px-3 py-3 text-right">Qty ERP</th><th className="px-3 py-3 text-right">Minimum</th><th className="px-3 py-3">Ready</th><th className="px-3 py-3">Harga jual</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr></thead><tbody>{liveProducts.map((item) => {
    const stockRows = stockRowsForProduct(item, stockLookup);
    const validQuantities = stockRows.map((stock) => stock.quantity).filter((quantity): quantity is number => typeof quantity === "number" && Number.isFinite(quantity));
    const quantity = item.stockSummary?.quantity ?? (stockSync.status === "failed" || stockRows.length === 0 || validQuantities.length === 0 ? null : validQuantities.reduce((sum, stockQuantity) => sum + stockQuantity, 0));
    const minimum = item.stockSummary?.minimumStock ?? item.minimumStock ?? stockRows.find((stock) => stock.minimumStock !== null && stock.minimumStock !== undefined)?.minimumStock ?? null;
    const unit = item.unit ?? stockRows.find((stock) => Boolean(stock.unit))?.unit ?? null;
    const warnings = productWarnings(item, stockRows, quantity, minimum);
    const shouldAlert = item.stockSummary?.isLowStock ?? stockRows.some((stock) => stock.isLowStock === true) ?? (quantity !== null && minimum !== null && minimum > 0 && quantity <= minimum);
    const ready = stockRows.find((stock) => stock.ready !== null && stock.ready !== undefined)?.ready ?? (quantity === null ? null : quantity > 0);
    return <tr key={item.id} className="border-b border-slate-100 transition hover:bg-slate-50/80"><td className="px-3 py-3 font-semibold text-slate-800">{item.code}</td><td className="px-3 py-3">{item.name}{qualityWarning(warnings)}</td><td className="px-3 py-3">{item.category ?? dash}</td><td className="px-3 py-3">{unit ?? dash}</td><td className="px-3 py-3 text-xs text-slate-600">{locationSummary(stockRows)}</td><td className="px-3 py-3 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shouldAlert ? "bg-red-50 text-red-700" : quantity === null ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>{formatNumber(quantity)}</span></td><td className="px-3 py-3 text-right">{formatNumber(minimum)}</td><td className="px-3 py-3">{ready === null ? <span className="text-slate-500">{dash}</span> : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ready ? "Ready" : "Tidak ready"}</span>}</td><td className="px-3 py-3">{formatMoney(item.sellingPrice)}</td><td className="px-3 py-3">{item.isActive === null ? <span className="text-slate-500">{dash}</span> : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.isActive ? "Aktif" : "Tidak aktif"}</span>}</td><td className="px-3 py-3 text-right"><div className="flex flex-col items-end gap-2"><Link className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline" href={stockDetailHref({ id: item.id, productId: item.productId, sku: item.code }, "/barang")}>Detail stok</Link>{canManage ? <><Link className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline" href={`/barang/${item.id}/edit`}>Edit</Link><ProductDeactivateButton id={item.id} disabled={item.isActive === false} /></> : null}</div></td></tr>;
  })}{liveProducts.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-500">Tidak ada barang yang sesuai.</td></tr>}</tbody></table></div><div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-500">Halaman {productPage.page} dari {productPage.totalPages}</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={loadingProducts || productPage.page <= 1} onClick={() => void fetchProducts(productPage.page - 1, query, { syncHistory: true, historyMode: "push" })}>Sebelumnya</Button><Button type="button" variant="secondary" disabled={loadingProducts || productPage.page >= productPage.totalPages} onClick={() => void fetchProducts(productPage.page + 1, query, { syncHistory: true, historyMode: "push" })}>Berikutnya</Button></div></div></section>;
}
