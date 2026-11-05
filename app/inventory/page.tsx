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
  const canEditMaster = can(role, "inventory.master");
  // Default membuka stok Toko; filter bisa diganti ke Gudang atau Gudang + Toko (ALL).
  const typeParam = params.type === "WAREHOUSE" || params.type === "ALL" ? params.type : "STORE";
  const type = typeParam === "ALL" ? undefined : typeParam;
  const matrix = await stockMatrix({ keyword: params.keyword, locationType: type, page: Number(params.page) || 1, pageSize: 50 });
  return (
    <AppShell>
      <InventoryHeader
        title="Stok Gudang & Toko"
        description={<>Seluruh stok di semua gudang dan toko dalam satu tabel. Sumber stok untuk penjualan saat ini: <b>{inventorySource() === "local" ? "Inventory SLM" : "ERP (belum cutover)"}</b>.</>}
        actions={<>
          {role === "OWNER" && <Link href="/stok-barang/ai-forecast" className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Prediksi Stok &amp; Dead Stock</Link>}
          {can(role, "inventory.transfer") && <Link href="/inventory/transfer" className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Transfer</Link>}
          {can(role, "inventory.receive") && <Link href="/inventory/barang-masuk" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Barang Masuk</Link>}
        </>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="keyword" defaultValue={params.keyword} placeholder="Cari SKU / nama barang" className={`${filterInput} w-64`} />
        <select name="type" defaultValue={typeParam} className={filterInput}>
          <option value="STORE">Toko</option>
          <option value="WAREHOUSE">Gudang</option>
          <option value="ALL">Gudang + Toko</option>
        </select>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <p className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Urut dari stok paling sedikit. Kode dengan stok 0 di paling bawah.</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border-l-4 border-l-red-500 bg-red-50" /> Stok ≤ 1 koli</span>
      </p>
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
              <tr key={row.productId} className={`border-t border-slate-100 ${row.lowStock ? "bg-red-50" : row.total <= 0 ? "opacity-60" : ""}`}>
                <td className={`sticky left-0 px-3 py-2 ${row.lowStock ? "border-l-4 border-l-red-500 bg-red-50" : "bg-white"}`}>
                  <ProductCell row={row} canMovement={canMovement} canEditMaster={canEditMaster} />
                </td>
                {matrix.locations.map((l) => (
                  <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.perLocation[l.id] < 0 ? "text-red-600" : row.perLocation[l.id] === 0 ? "text-slate-300" : ""}`}>
                    <QtyCell qty={row.perLocation[l.id]} koli={row.perLocationKoli[l.id]} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} />
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"><QtyCell qty={row.warehouseTotal} koli={row.warehouseKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"><QtyCell qty={row.storeTotal} koli={row.storeKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${row.lowStock ? "text-red-600" : ""}`}><QtyCell qty={row.total} koli={row.totalKoliText} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} /></td>
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
      <Pager basePath="/inventory" params={{ keyword: params.keyword, type: typeParam }} page={matrix.meta.page} totalPages={matrix.meta.totalPages} />
    </AppShell>
  );
}

/** Tampilkan "32 koli" dengan qty satuan di bawahnya bila barang punya isi/koli. */
function QtyCell({ qty, koli, unit, hasKoli }: { qty: number; koli: string; unit: string; hasKoli: boolean }) {
  if (!hasKoli || qty === 0) return <>{fmtQty(qty)}</>;
  return <>{koli}<div className="text-[11px] font-normal text-slate-400">{fmtQty(qty)} {unit}</div></>;
}

type MatrixRow = { productId: string; sku: string; name: string; category: string | null; hasName: boolean; unit: string; unitsPerKoli: number | null };

/** Nama barang (besar) lalu kode, kategori, satuan & isi koli. Kode tanpa nama ditandai agar mudah dilengkapi. */
function ProductCell({ row, canMovement, canEditMaster }: { row: MatrixRow; canMovement: boolean; canEditMaster: boolean }) {
  const title = row.hasName
    ? <span className="font-semibold leading-snug text-slate-900">{row.name}</span>
    : <span className="text-sm italic text-slate-400">Nama belum diisi</span>;
  return (
    <div className="min-w-[220px] max-w-[320px]">
      {canMovement && row.hasName ? <Link href={`/inventory/mutasi?productId=${row.productId}`} className="hover:text-emerald-700">{title}</Link> : title}
      {!row.hasName && canEditMaster && (
        <Link href={`/inventory/produk?keyword=${encodeURIComponent(row.sku)}&edit=${row.productId}`} className="ml-2 text-xs font-semibold text-emerald-700 hover:underline">Isi nama</Link>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">{row.sku}</span>
        {row.category && <span>{row.category}</span>}
        {row.category && <span className="text-slate-300">•</span>}
        <span>{row.unit}{row.unitsPerKoli ? ` • isi ${fmtQty(row.unitsPerKoli)}/koli` : ""}</span>
      </div>
    </div>
  );
}
