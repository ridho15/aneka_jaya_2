"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { StockItem } from "@/lib/types/stock";

const dash = "—";
const formatNumber = (value: number | null | undefined) => value === null || value === undefined ? dash : new Intl.NumberFormat("id-ID").format(value);
const timeLabel = () => new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date());

function warningBadge(stock: StockItem) {
  const warnings = stock.dataQualityWarnings ?? [];
  if (warnings.length === 0) return null;
  return <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700" title={warnings.join(", ")}>Data ERP tidak lengkap</span>;
}

export function StockList({ initialStocks }: { initialStocks: StockItem[] }) {
  const [stocks, setStocks] = useState(initialStocks);
  const [query, setQuery] = useState("");
  const [updated, setUpdated] = useState(timeLabel());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/stocks", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) {
        setStocks(result.data);
        setUpdated(timeLabel());
        setSyncError(null);
      } else {
        setSyncError(result?.message || "Refresh stok ERP gagal. Menampilkan data valid terakhir.");
      }
    } catch {
      setSyncError("Refresh stok ERP gagal karena koneksi bermasalah. Menampilkan data valid terakhir.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const shown = useMemo(() => {
    const value = query.toLowerCase().trim();
    return stocks.filter((stock) => !value || `${stock.productCode} ${stock.productName} ${stock.warehouse ?? ""}`.toLowerCase().includes(value));
  }, [stocks, query]);

  return <section className="aj-surface overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><Input className="max-w-md" placeholder="Cari kode, nama barang, atau gudang" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="flex flex-col gap-2 sm:items-end"><Button type="button" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refresh..." : "Refresh ERP"}</Button><div className="space-y-1 text-xs text-slate-500"><p>Sinkron otomatis tiap 30 detik · terakhir berhasil {updated}</p>{syncError && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-medium text-amber-800">Refresh gagal, memakai data terakhir. {syncError}</p>}</div></div></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama barang</th><th className="px-5 py-3">Gudang</th><th className="px-5 py-3">Rak</th><th className="px-5 py-3 text-right">Qty tersedia</th><th className="px-5 py-3 text-right">Free</th><th className="px-5 py-3 text-right">On hand</th><th className="px-5 py-3 text-right">Reserved</th><th className="px-5 py-3 text-right">Minimum</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Satuan</th></tr></thead><tbody>{shown.map((stock) => {
    const shouldAlert = stock.isLowStock ?? (stock.quantity !== null && stock.minimumStock !== null && stock.minimumStock !== undefined && stock.minimumStock > 0 && stock.quantity <= stock.minimumStock);
    return <tr key={stock.id} className="border-b border-slate-100"><td className="px-5 py-4 font-semibold text-slate-800">{stock.productCode}</td><td className="px-5 py-4">{stock.productName}{warningBadge(stock)}</td><td className="px-5 py-4">{stock.warehouse ?? dash}</td><td className="px-5 py-4">{stock.rack || dash}</td><td className="px-5 py-4 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${shouldAlert ? "bg-red-50 text-red-700" : stock.quantity === null ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{formatNumber(stock.quantity)}</span></td><td className="px-5 py-4 text-right">{formatNumber(stock.freeQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.onHandQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.reservedQuantity)}</td><td className="px-5 py-4 text-right">{formatNumber(stock.minimumStock)}</td><td className="px-5 py-4">{stock.ready === null || stock.ready === undefined ? dash : stock.ready ? "Ready" : "Tidak ready"}</td><td className="px-5 py-4 text-slate-600">{stock.unit ?? dash}</td></tr>;
  })}{shown.length === 0 && <tr><td colSpan={11} className="px-5 py-9 text-center text-slate-500">Tidak ada data stok yang sesuai.</td></tr>}</tbody></table></div></section>;
}
