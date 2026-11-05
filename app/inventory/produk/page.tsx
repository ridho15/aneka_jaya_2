import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProductCreateForm } from "@/components/inventory/ProductCreateForm";
import { ProductTable } from "@/components/inventory/ProductTable";
import { RmbRateForm } from "@/components/inventory/RmbRateForm";
import { BulkUnitForm } from "@/components/inventory/BulkUnitForm";
import { InventoryHeader, Pager, filterInput } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getRmbRate } from "@/lib/inventory/pricing";
import { listLocations, listProducts, listUnitUsage } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function InventoryProductPage({ searchParams }: { searchParams: Promise<{ keyword?: string; page?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.master")) redirect("/no-access");
  const p = await searchParams;
  const canManage = can(role, "inventory.master");
  const [locations, result, rmb, rmbProducts, units] = await Promise.all([
    listLocations(),
    listProducts({ keyword: p.keyword, page: Number(p.page) || 1, pageSize: 50 }),
    getRmbRate(),
    prisma.inventoryProduct.count({ where: { priceRmb: { not: null } } }),
    listUnitUsage()
  ]);
  return (
    <AppShell>
      <InventoryHeader title="Master Barang" description="Atur isi per koli (berapa lusin/pack/box dalam 1 koli), harga RMB, modal, dan harga jual. Isi 'ID Produk ERP' bila barang sudah ada di ERP agar transaksi lama tetap terhubung." />
      <RmbRateForm rate={rmb.rate} updatedAt={rmb.updatedAt} updatedBy={rmb.updatedBy} rmbProducts={rmbProducts} canManage={canManage} />
      {canManage && units.length > 0 && <BulkUnitForm units={units} />}
      <form className="mb-4 flex gap-2">
        <input name="keyword" defaultValue={p.keyword} placeholder="Cari SKU / nama / barcode" className={`${filterInput} w-72`} />
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Cari</button>
      </form>
      <ProductTable rows={result.data} rate={rmb.rate} canManage={canManage} />
      <Pager basePath="/inventory/produk" params={{ keyword: p.keyword }} page={result.meta.page} totalPages={result.meta.totalPages} />
      {canManage && <ProductCreateForm locations={locations} />}
    </AppShell>
  );
}
