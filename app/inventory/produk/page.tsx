import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProductCreateForm } from "@/components/inventory/ProductCreateForm";
import { ProductTable } from "@/components/inventory/ProductTable";
import { RmbRateForm } from "@/components/inventory/RmbRateForm";
import { BulkUnitForm } from "@/components/inventory/BulkUnitForm";
import { InventoryHeader, Pager, filterButton, filterInput } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getRmbRate } from "@/lib/inventory/pricing";
import { listLocations, listProducts, listUnitUsage } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function InventoryProductPage({ searchParams }: { searchParams: Promise<{ keyword?: string; page?: string; edit?: string }> }) {
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
      <InventoryHeader title="Master Barang" description="Atur isi per koli, harga RMB, modal, dan harga jual tiap barang." />
      <RmbRateForm rate={rmb.rate} updatedAt={rmb.updatedAt} updatedBy={rmb.updatedBy} rmbProducts={rmbProducts} canManage={canManage} />
      <form className="mb-4 flex gap-2">
        <input name="keyword" defaultValue={p.keyword} placeholder="Cari SKU / nama / barcode" className={`${filterInput} w-72`} />
        <button className={filterButton}>Cari</button>
      </form>
      <ProductTable rows={result.data} rate={rmb.rate} canManage={canManage} initialEditingId={p.edit} />
      <Pager basePath="/inventory/produk" params={{ keyword: p.keyword }} page={result.meta.page} totalPages={result.meta.totalPages} />
      {canManage && <ProductCreateForm locations={locations} />}
      {canManage && units.length > 0 && <div className="mt-6"><BulkUnitForm units={units} /></div>}
    </AppShell>
  );
}
