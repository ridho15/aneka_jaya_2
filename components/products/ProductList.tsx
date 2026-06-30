"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProductListItem } from "@/lib/types/product";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { StockItem } from "@/lib/types/stock";
import { normalizeProductCode } from "@/lib/api/erpMappers";
import { ProductDeactivateButton } from "@/components/products/ProductDeactivateButton";

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

function locationSummary(stockRows: StockItem[]) {
  const locations = stockRows.map((stock) => [stock.warehouse, stock.rack].filter(Boolean).join(" / ")).filter(Boolean);
  const unique = Array.from(new Set(locations));
  if (unique.length === 0) return dash;
  if (unique.length <= 2) return unique.join(", ");
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
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

function stockRowsForProduct(item: ProductListItem, stocks: StockItem[]) {
  if (item.stockBreakdown?.length) return item.stockBreakdown;
  const productJoinKeys = new Set([normalizeProductCode(item.productId), normalizeProductCode(item.id), normalizeProductCode(item.code)].filter(Boolean));
  return stocks.filter((stock) => stockJoinValues(stock).some((value) => productJoinKeys.has(value)));
}

export function ProductList({ products, stocks, initialStockError, canManage = false }: { products: ProductListItem[]; stocks: StockItem[]; initialStockError?: string | null; canManage?: boolean }) {
  const [liveProducts, setLiveProducts] = useState<ProductListItem[]>(products);
  const [liveStocks, setLiveStocks] = useState(stocks);
  const [stockSync, setStockSync] = useState<StockSyncState>(() => initialStockError ? { status: "failed", message: initialStockError } : { status: "success", updatedAt: timeLabel() });
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [productResponse, stockResponse] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/stocks", { cache: "no-store" })
      ]);
      const productResult = await productResponse.json().catch(() => null);
      const stockResult = await stockResponse.json().catch(() => null);

      if (productResponse.ok && productResult?.success) setLiveProducts(productResult.data);
      if (stockResponse.ok && stockResult?.success) {
        setLiveStocks(stockResult.data);
        setStockSync({ status: "success", updatedAt: timeLabel() });
      } else {
        setStockSync((previous) => ({
          status: previous.updatedAt || liveStocks.length > 0 ? "stale" : "failed",
          message: stockResult?.message || "Refresh stok ERP gagal. Menampilkan data valid terakhir bila tersedia.",
          updatedAt: previous.updatedAt
        }));
      }
    } catch {
      setStockSync((previous) => ({
        status: previous.updatedAt || liveStocks.length > 0 ? "stale" : "failed",
        message: "Refresh ERP gagal karena koneksi bermasalah. Menampilkan data valid terakhir bila tersedia.",
        updatedAt: previous.updatedAt
      }));
    } finally {
      setRefreshing(false);
    }
  }, [liveStocks.length]);

  useEffect(() => {
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const shown = useMemo(() => {
    const value = query.toLowerCase().trim();
    return liveProducts.filter((item) => !value || item.code.toLowerCase().includes(value) || item.name.toLowerCase().includes(value));
  }, [liveProducts, query]);

  return <section className="aj-surface p-5 sm:p-6"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Input className="max-w-md" placeholder="Cari kode atau nama barang" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="flex flex-wrap gap-2"><Link href="/stok-barang"><Button type="button" variant="secondary">Detail per Gudang</Button></Link><Button type="button" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refresh..." : "Refresh ERP"}</Button>{canManage && <Link href="/barang/input"><Button>+ Tambah Barang</Button></Link>}</div></div><div className="mb-4 space-y-2"><p className="text-xs text-slate-500">Quantity disinkronkan dari ERP setiap 30 detik{stockSync.updatedAt ? ` · terakhir berhasil ${stockSync.updatedAt}` : ""}. Qty di halaman ini adalah total gabungan stok ERP per barang.</p>{stockSync.status !== "success" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{stockSync.status === "stale" ? "Refresh stok gagal, memakai data terakhir." : "Stok ERP belum berhasil dimuat."} {stockSync.message}</p>}</div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Kode</th><th className="px-3 py-3">Nama barang</th><th className="px-3 py-3">Kategori</th><th className="px-3 py-3">Lokasi ERP</th><th className="px-3 py-3 text-right">Qty ERP</th><th className="px-3 py-3 text-right">Minimum</th><th className="px-3 py-3">Harga jual</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr></thead><tbody>{shown.map((item) => {
    const stockRows = stockRowsForProduct(item, liveStocks);
    const validQuantities = stockRows.map((stock) => stock.quantity).filter((quantity): quantity is number => typeof quantity === "number" && Number.isFinite(quantity));
    const quantity = item.stockSummary?.quantity ?? (stockSync.status === "failed" || stockRows.length === 0 || validQuantities.length === 0 ? null : validQuantities.reduce((sum, stockQuantity) => sum + stockQuantity, 0));
    const minimum = item.stockSummary?.minimumStock ?? item.minimumStock ?? stockRows.find((stock) => stock.minimumStock !== null && stock.minimumStock !== undefined)?.minimumStock ?? null;
    const warnings = productWarnings(item, stockRows, quantity, minimum);
    const shouldAlert = item.stockSummary?.isLowStock ?? stockRows.some((stock) => stock.isLowStock === true) ?? (quantity !== null && minimum !== null && minimum > 0 && quantity <= minimum);
    return <tr key={item.id} className="border-b border-slate-100 transition hover:bg-slate-50/80"><td className="px-3 py-3 font-semibold text-slate-800">{item.code}</td><td className="px-3 py-3">{item.name}{qualityWarning(warnings)}</td><td className="px-3 py-3">{item.category ?? dash}</td><td className="px-3 py-3 text-xs text-slate-600">{locationSummary(stockRows)}</td><td className="px-3 py-3 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shouldAlert ? "bg-red-50 text-red-700" : quantity === null ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>{formatNumber(quantity)}</span></td><td className="px-3 py-3 text-right">{formatNumber(minimum)}</td><td className="px-3 py-3">{formatMoney(item.sellingPrice)}</td><td className="px-3 py-3">{item.isActive === null ? <span className="text-slate-500">{dash}</span> : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.isActive ? "Aktif" : "Tidak aktif"}</span>}</td><td className="px-3 py-3 text-right">{canManage ? <div className="flex flex-col items-end gap-2"><Link className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline" href={`/barang/${item.id}/edit`}>Edit</Link><ProductDeactivateButton id={item.id} disabled={item.isActive === false} /></div> : null}</td></tr>;
  })}{shown.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Tidak ada barang yang sesuai.</td></tr>}</tbody></table></div></section>;
}
