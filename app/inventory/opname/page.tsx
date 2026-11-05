import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryDocumentForm } from "@/components/inventory/InventoryDocumentForm";
import { InventoryHeader, Pager, fmtDate, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations, listOpnames, listProductOptions } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function OpnamePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.opname")) redirect("/no-access");
  const p = await searchParams;
  const [locations, products, result] = await Promise.all([listLocations(), listProductOptions(), listOpnames({ page: Number(p.page) || 1 })]);
  return (
    <AppShell>
      <InventoryHeader title="Stock Opname" description={<>Hitung fisik barang, lalu isi jumlah sebenarnya. Stok sistem akan <b>diganti</b> dengan hasil hitung, dan selisihnya tercatat di kartu stok.</>} />
      {can(role, "inventory.opname") && <div className="mb-8"><InventoryDocumentForm mode="opname" locations={locations} products={products} /></div>}
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr><th className="px-3 py-2">No. Opname</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Lokasi</th><th className="px-3 py-2">Barang (sistem → fisik = selisih)</th><th className="px-3 py-2">Oleh</th></tr>
          </thead>
          <tbody>
            {result.data.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">{o.opnameNumber}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(o.opnameDate)}</td>
                <td className="px-3 py-2">{o.location?.code}</td>
                <td className="px-3 py-2 text-xs">{o.items.map((i) => (
                  <div key={i.id}>{i.sku} · {i.productName}: {fmtQty(i.systemQty)} → {fmtQty(i.countedQty)}{i.koliText?.includes("koli") ? ` (${i.koliText})` : ""} = <b className={(i.differenceQty ?? 0) < 0 ? "text-red-800" : (i.differenceQty ?? 0) > 0 ? "text-emerald-800" : ""}>{(i.differenceQty ?? 0) > 0 ? "+" : ""}{fmtQty(i.differenceQty)}</b></div>
                ))}</td>
                <td className="px-3 py-2 text-xs">{o.createdByName}{o.notes && <div className="text-slate-500">{o.notes}</div>}</td>
              </tr>
            ))}
            {!result.data.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Belum ada stock opname.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory/opname" params={{}} page={result.meta.page} totalPages={result.meta.totalPages} />
    </AppShell>
  );
}
