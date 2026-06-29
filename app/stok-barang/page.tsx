import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/ui/ErrorState";
import { StockList } from "@/components/stocks/StockList";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listStocks } from "@/lib/api/stocks";

export const dynamic = "force-dynamic";
export default async function StokBarangPage() { const role = await getCurrentRole(); if (!can(role, "stock.view")) redirect("/penjualan/input"); const response = await listStocks(); return <AppShell><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Stock</p><h2 className="aj-page-title text-3xl font-bold">Stok Barang</h2><p className="mt-2 text-sm text-slate-600">Tampilan stok ERP. Data disinkronkan berkala dan dicek minimum stock.</p></div>{response.success ? <StockList initialStocks={response.data} /> : <ErrorState message={response.message} />}</AppShell>; }
