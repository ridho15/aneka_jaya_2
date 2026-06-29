import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { BarangForm } from "@/components/forms/BarangForm";
import { ErrorState } from "@/components/ui/ErrorState";
import { getProduct } from "@/lib/api/products";
import { requirePermission } from "@/lib/auth/requirePermission";

export const dynamic = "force-dynamic";
export default async function EditBarangPage({ params }: { params: Promise<{ id: string }> }) { await requirePermission("stock.create"); const { id } = await params; const response = await getProduct(id); if (!response.success && response.code === "NOT_FOUND") notFound(); return <AppShell><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Inventaris</p><h2 className="aj-page-title text-3xl font-bold">Edit Data Barang</h2><p className="mt-2 text-sm text-slate-600">Perbarui informasi barang yang sudah ada.</p></div>{response.success ? <BarangForm product={response.data} /> : <ErrorState message={response.message} />}</AppShell>; }
