import { AppShell } from "@/components/layout/AppShell";
import { BarangForm } from "@/components/forms/BarangForm";
import { requirePermission } from "@/lib/auth/requirePermission";
export default async function InputBarangPage() { await requirePermission("stock.manage"); return <AppShell><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Inventaris</p><h2 className="aj-page-title text-3xl font-bold">Input Data Barang</h2><p className="mt-2 text-sm text-slate-600">Tambahkan barang baru ke daftar produk.</p></div><BarangForm /></AppShell>; }
