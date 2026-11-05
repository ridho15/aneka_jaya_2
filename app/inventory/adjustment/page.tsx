import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryDocumentForm } from "@/components/inventory/InventoryDocumentForm";
import { InventoryHeader, Pager, fmtDate, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listAdjustments, listLocations, listProductOptions } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function AdjustmentPage({ searchParams }: { searchParams: Promise<{ page?: string; productId?: string; locationId?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.adjust")) redirect("/no-access");
  const p = await searchParams;
  const [locations, products, result] = await Promise.all([listLocations(), listProductOptions(), listAdjustments({ page: Number(p.page) || 1 })]);
  return (
    <AppShell>
      <InventoryHeader title="Stock Adjustment" description="Tambah atau kurangi stok yang ada, mis. barang rusak, hilang, atau bonus. Isi angka minus untuk mengurangi." />
      {can(role, "inventory.adjust") && <div className="mb-8"><InventoryDocumentForm key={p.productId ?? "new"} mode="adjustment" locations={locations} products={products} initialProductId={p.productId} initialLocationId={p.locationId} /></div>}
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr><th className="px-3 py-2">No. Adjustment</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Lokasi</th><th className="px-3 py-2">Alasan</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2">Oleh</th></tr>
          </thead>
          <tbody>
            {result.data.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">{a.adjustmentNumber}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(a.adjustmentDate)}</td>
                <td className="px-3 py-2">{a.location?.code}</td>
                <td className="px-3 py-2">{a.reason}</td>
                <td className="px-3 py-2 text-xs">{a.items.map((i) => (
                  <div key={i.id}>{i.sku} · {i.productName}: <b className={(i.quantity ?? 0) < 0 ? "text-red-800" : "text-emerald-800"}>{(i.quantity ?? 0) > 0 ? "+" : ""}{fmtQty(i.quantity)}</b> {i.unit}{i.koliText?.includes("koli") ? ` (${i.koliText})` : ""}</div>
                ))}</td>
                <td className="px-3 py-2 text-xs">{a.createdByName}</td>
              </tr>
            ))}
            {!result.data.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Belum ada adjustment.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory/adjustment" params={{}} page={result.meta.page} totalPages={result.meta.totalPages} />
    </AppShell>
  );
}
