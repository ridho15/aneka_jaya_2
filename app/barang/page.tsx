import { AppShell } from "@/components/layout/AppShell";
import { ProductList } from "@/components/products/ProductList";
import { ErrorState } from "@/components/ui/ErrorState";
import { listProducts } from "@/lib/api/products";
import { listStocks } from "@/lib/api/stocks";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export default async function BarangPage() { const role = await getCurrentRole(); if (!can(role, "stock.view")) return <AppShell><ErrorState message="Tidak punya akses Stock Barang." /></AppShell>; const response = await listProducts(); const stocks = await listStocks(); return <AppShell><div className="mb-7"><h2 className="aj-page-title text-3xl font-bold">Stock Barang</h2><p className="mt-2 text-sm text-slate-600">Data barang dan quantity terbaru ditarik dari ERP setiap 30 detik. Minimum stock akan memicu alert WhatsApp hanya bila qty dan minimum valid.</p></div>{response.success ? <ProductList products={response.data} stocks={stocks.success ? stocks.data : []} initialStockError={stocks.success ? null : stocks.message} canManage={can(role, "stock.manage")} /> : <ErrorState message={response.message} />}</AppShell>; }
