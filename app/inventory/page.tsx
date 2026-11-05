import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryHeader, Pager, filterButton, filterInput, fmtQty } from "@/components/inventory/ui";
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
  // Default Toko; ALL = Gudang + Toko.
  const typeParam = params.type === "WAREHOUSE" || params.type === "ALL" ? params.type : "STORE";
  const type = typeParam === "ALL" ? undefined : typeParam;
  const matrix = await stockMatrix({ keyword: params.keyword, locationType: type, page: Number(params.page) || 1, pageSize: 50 });
  const scopeLabel = typeParam === "STORE" ? "Total Toko" : typeParam === "WAREHOUSE" ? "Total Gudang" : "Total Semua";
  const scopeKoli = (row: (typeof matrix.data)[number]) => (typeParam === "STORE" ? row.storeKoliText : typeParam === "WAREHOUSE" ? row.warehouseKoliText : row.totalKoliText);
  return (
    <AppShell>
      <InventoryHeader
        title="Stok Gudang & Toko"
        description={<>Stok semua gudang dan toko dalam satu tabel. Penjualan saat ini memotong stok dari <b>{inventorySource() === "local" ? "SLM" : "ERP (belum pindah ke SLM)"}</b>.</>}
        actions={<>
          {role === "OWNER" && <Link href="/stok-barang/ai-forecast" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 px-4 text-sm font-semibold text-emerald-800">Prediksi Stok &amp; Dead Stock</Link>}
          {can(role, "inventory.transfer") && <Link href="/inventory/transfer" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 px-4 text-sm font-semibold text-emerald-800">Transfer</Link>}
          {can(role, "inventory.receive") && <Link href="/inventory/barang-masuk" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Barang Masuk</Link>}
        </>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="keyword" defaultValue={params.keyword} placeholder="Cari kode / nama barang" className={`${filterInput} sm:w-64`} />
        <select name="type" defaultValue={typeParam} className={filterInput} aria-label="Lokasi yang ditampilkan">
          <option value="STORE">Toko</option>
          <option value="WAREHOUSE">Gudang</option>
          <option value="ALL">Gudang + Toko</option>
        </select>
        <button className={filterButton}>Tampilkan</button>
      </form>
      <p className="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>Urut dari stok paling sedikit. Barang yang stoknya habis ada di paling bawah.</span>
        <LowChip /> <span>= sisa 1 koli atau kurang</span>
      </p>
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-3 py-2">Barang</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">{scopeLabel}</th>
              {typeParam !== "WAREHOUSE" && typeParam !== "ALL" && <th className="whitespace-nowrap px-3 py-2 text-right">Total Gudang</th>}
              {typeParam === "WAREHOUSE" && <th className="whitespace-nowrap px-3 py-2 text-right">Total Toko</th>}
              {typeParam !== "ALL" && <th className="whitespace-nowrap px-3 py-2 text-right">Total Semua</th>}
              {matrix.locations.map((l) => (
                <th key={l.id} className="whitespace-nowrap px-3 py-2 text-right normal-case">
                  {canMovement ? <Link href={`/inventory/mutasi?locationId=${l.id}`} className="hover:text-emerald-800">{l.name}</Link> : l.name}
                  <div className="text-[11px] font-normal text-slate-600">{l.code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.data.map((row) => {
              const qty = (n: number, koli: string) => <QtyCell qty={n} koli={koli} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} />;
              return (
                <tr key={row.productId} className={`border-t border-slate-100 ${row.lowStock ? "bg-red-50" : ""}`}>
                  <td className={`sticky left-0 z-10 px-3 py-2 ${row.lowStock ? "bg-red-50" : "bg-white"}`}>
                    <ProductCell row={row} canMovement={canMovement} canEditMaster={canEditMaster} />
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${row.lowStock ? "text-red-800" : "text-slate-900"}`}>
                    {qty(row.scopeTotal, scopeKoli(row))}
                  </td>
                  {typeParam !== "WAREHOUSE" && typeParam !== "ALL" && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(row.warehouseTotal, row.warehouseKoliText)}</td>}
                  {typeParam === "WAREHOUSE" && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(row.storeTotal, row.storeKoliText)}</td>}
                  {typeParam !== "ALL" && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(row.total, row.totalKoliText)}</td>}
                  {matrix.locations.map((l) => (
                    <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.perLocation[l.id] < 0 ? "text-red-800" : ""}`}>
                      {qty(row.perLocation[l.id], row.perLocationKoli[l.id])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!matrix.data.length && (
              <tr><td colSpan={matrix.locations.length + 4} className="px-3 py-8 text-center text-slate-600">
                Belum ada barang.{can(role, "inventory.master") && <> Mulai dari <Link className="text-emerald-800 underline" href="/inventory/lokasi">Lokasi Stok</Link> lalu <Link className="text-emerald-800 underline" href="/inventory/produk">Master Barang</Link>.</>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory" params={{ keyword: params.keyword, type: typeParam }} page={matrix.meta.page} totalPages={matrix.meta.totalPages} />
    </AppShell>
  );
}

/** Stok 0 tampil "–" (bukan angka pucat); barang ber-koli tampil "N koli" dengan qty satuan di bawahnya. */
function QtyCell({ qty, koli, unit, hasKoli }: { qty: number; koli: string; unit: string; hasKoli: boolean }) {
  if (qty === 0) return <span className="text-slate-500" aria-label="0">–</span>;
  if (!hasKoli) return <>{fmtQty(qty)}</>;
  return <>{koli}{koli.includes("koli") && <div className="text-xs font-normal text-slate-600">{fmtQty(qty)} {unit}</div>}</>;
}

function LowChip() {
  return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Menipis</span>;
}

type MatrixRow = { productId: string; sku: string; name: string; category: string | null; hasName: boolean; unit: string; unitsPerKoli: number | null; lowStock: boolean };

/** Kode tanpa nama ditandai agar mudah dilengkapi. */
function ProductCell({ row, canMovement, canEditMaster }: { row: MatrixRow; canMovement: boolean; canEditMaster: boolean }) {
  const title = row.hasName
    ? <span className="font-semibold leading-snug text-slate-900">{row.name}</span>
    : <span className="text-sm italic text-slate-600">Nama belum diisi</span>;
  return (
    <div className="min-w-[200px] max-w-[300px]">
      <div className="flex flex-wrap items-center gap-2">
        {canMovement && row.hasName ? <Link href={`/inventory/mutasi?productId=${row.productId}`} className="hover:text-emerald-800">{title}</Link> : title}
        {row.lowStock && <LowChip />}
        {!row.hasName && canEditMaster && (
          <Link href={`/inventory/produk?keyword=${encodeURIComponent(row.sku)}&edit=${row.productId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Isi nama</Link>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-800">{row.sku}</span>
        {row.category && <span>{row.category} ·</span>}
        <span>{row.unit}{row.unitsPerKoli ? ` · isi ${fmtQty(row.unitsPerKoli)} ${row.unit}/koli` : ""}</span>
      </div>
    </div>
  );
}
