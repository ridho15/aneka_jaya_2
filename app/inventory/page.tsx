import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryHeader, Pager, filterInput, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { stockMatrix } from "@/lib/inventory/service";
import { inventorySource } from "@/lib/inventory/config";

export const dynamic = "force-dynamic";
type SP = Promise<{ keyword?: string; type?: string; page?: string }>;

export default async function InventoryStockPage({ searchParams }: { searchParams: SP }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.stock.view")) redirect("/no-access");
  const params = await searchParams;
  const canMovement = can(role, "inventory.movement.view");
  const type = params.type === "STORE" || params.type === "WAREHOUSE" ? params.type : undefined;
  const matrix = await stockMatrix({ keyword: params.keyword, locationType: type, page: Number(params.page) || 1, pageSize: 50 });
  return (
    <AppShell>
      <InventoryHeader
        title="Stok Gudang & Toko"
        description={<>Seluruh stok di semua gudang dan toko dalam satu tabel. Sumber stok untuk penjualan saat ini: <b>{inventorySource() === "local" ? "Inventory SLM" : "ERP (belum cutover)"}</b>.</>}
        actions={<>
          {can(role, "inventory.transfer") && <Link href="/inventory/transfer" className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Transfer</Link>}
          {can(role, "inventory.receive") && <Link href="/inventory/barang-masuk" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Barang Masuk</Link>}
        </>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="keyword" defaultValue={params.keyword} placeholder="Cari SKU / nama barang" className={`${filterInput} w-64`} />
        <select name="type" defaultValue={type ?? ""} className={filterInput}>
          <option value="">Gudang + Toko</option>
          <option value="WAREHOUSE">Gudang saja</option>
          <option value="STORE">Toko saja</option>
        </select>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 min-w-[220px] bg-slate-50 px-3 py-2">Barang</th>
              {matrix.locations.map((l) => (
                <th key={l.id} className="whitespace-nowrap px-3 py-2 text-right">
                  {canMovement ? <Link href={`/inventory/mutasi?locationId=${l.id}`} className="hover:text-emerald-700">{l.code}</Link> : l.code}
                  <div className="text-[10px] font-normal normal-case">{l.type === "STORE" ? "Toko" : "Gudang"}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-right">Total Gudang</th>
              <th className="px-3 py-2 text-right">Total Toko</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.data.map((row) => (
              <tr key={row.productId} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2">
                  {canMovement ? <Link href={`/inventory/mutasi?productId=${row.productId}`} className="font-semibold text-slate-800 hover:text-emerald-700">{row.name}</Link> : <span className="font-semibold text-slate-800">{row.name}</span>}
                  <div className="text-xs text-slate-500">{row.sku} • {row.unit}{row.unitsPerKoli ? ` • ${fmtQty(row.unitsPerKoli)}/koli` : ""}</div>
                </td>
                {matrix.locations.map((l) => (
                  <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.perLocation[l.id] < 0 ? "text-red-600" : row.perLocation[l.id] === 0 ? "text-slate-300" : ""}`}>
                    <QtyCell qty={row.perLocation[l.id]} koli={row.perLocationKoli[l.id]} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} />
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"><QtyCell qty={row.warehouseTotal} koli={row.warehouseKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"><QtyCell qty={row.storeTotal} koli={row.storeKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${row.minimumStock > 0 && row.total <= row.minimumStock ? "text-red-600" : ""}`}><QtyCell qty={row.total} koli={row.totalKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
              </tr>
            ))}
            {!matrix.data.length && (
              <tr><td colSpan={matrix.locations.length + 4} className="px-3 py-8 text-center text-slate-500">
                Belum ada barang.{can(role, "inventory.master") && <> Mulai dari <Link className="text-emerald-700 underline" href="/inventory/lokasi">Gudang & Toko</Link> lalu <Link className="text-emerald-700 underline" href="/inventory/produk">Master Barang</Link>.</>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory" params={{ keyword: params.keyword, type }} page={matrix.meta.page} totalPages={matrix.meta.totalPages} />
    </AppShell>
  );
}

/** Tampilkan "32 koli" dengan qty satuan di bawahnya bila barang punya isi/koli. */
function QtyCell({ qty, koli, unit, hasKoli }: { qty: number; koli: string; unit: string; hasKoli: boolean }) {
  if (!hasKoli || qty === 0) return <>{fmtQty(qty)}</>;
  return <>{koli}<div className="text-[11px] font-normal text-slate-400">{fmtQty(qty)} {unit}</div></>;
}
