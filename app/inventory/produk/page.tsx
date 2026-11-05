import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductCreateForm } from "@/components/inventory/ProductCreateForm";
import { InventoryHeader, Pager, filterInput, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations, listProducts } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function InventoryProductPage({ searchParams }: { searchParams: Promise<{ keyword?: string; page?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.view")) redirect("/no-access");
  const p = await searchParams;
  const [locations, result] = await Promise.all([listLocations(), listProducts({ keyword: p.keyword, page: Number(p.page) || 1, pageSize: 50 })]);
  return (
    <AppShell>
      <InventoryHeader title="Master Barang" description="Daftar barang inventory SLM. Isi 'ID Produk ERP' bila barang sudah ada di ERP agar transaksi penjualan lama tetap terhubung." />
      <form className="mb-4 flex gap-2">
        <input name="keyword" defaultValue={p.keyword} placeholder="Cari SKU / nama / barcode" className={`${filterInput} w-72`} />
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Cari</button>
      </form>
      <div className="aj-surface mb-8 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Kategori / Merk</th><th className="px-3 py-2">Satuan</th><th className="px-3 py-2 text-right">Min. Stok</th><th className="px-3 py-2 text-right">HPP</th><th className="px-3 py-2 text-right">Total Stok</th><th className="px-3 py-2">ERP ID</th></tr>
          </thead>
          <tbody>
            {result.data.map((x) => (
              <tr key={x.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{x.sku}</td>
                <td className="px-3 py-2"><Link className="hover:text-emerald-700" href={`/inventory/mutasi?productId=${x.id}`}>{x.name}</Link></td>
                <td className="px-3 py-2 text-xs">{[x.category, x.brand].filter(Boolean).join(" / ") || "-"}</td>
                <td className="px-3 py-2">{x.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtQty(x.minimumStock)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.costPrice.toLocaleString("id-ID")}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${x.minimumStock > 0 && x.totalQuantity <= x.minimumStock ? "text-red-600" : ""}`}>{fmtQty(x.totalQuantity)}</td>
                <td className="px-3 py-2 text-xs">{x.erpProductId ?? "-"}</td>
              </tr>
            ))}
            {!result.data.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Belum ada barang.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory/produk" params={{ keyword: p.keyword }} page={result.meta.page} totalPages={result.meta.totalPages} />
      {can(role, "inventory.manage") && <ProductCreateForm locations={locations} />}
    </AppShell>
  );
}
