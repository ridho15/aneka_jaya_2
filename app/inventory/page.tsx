import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InlineNameForm } from "@/components/inventory/InlineNameForm";
import { ProductPhoto } from "@/components/inventory/ProductPhoto";
import { InventoryHeader, Pager, filterButton, filterInput, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { stockMatrix } from "@/lib/inventory/service";
import { inventorySource, stockViewType } from "@/lib/inventory/config";

export const dynamic = "force-dynamic";
type SP = Promise<{ keyword?: string; type?: string; page?: string; missing?: string }>;

export default async function InventoryStockPage({ searchParams }: { searchParams: SP }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.stock.view")) redirect("/no-access");
  const params = await searchParams;
  const canMovement = can(role, "inventory.movement.view");
  const canEditMaster = can(role, "inventory.master");
  const canAdjust = can(role, "inventory.adjust");
  const missingName = canEditMaster && params.missing === "1";
  const typeParam = stockViewType(params.type, role);
  const type = typeParam === "ALL" ? undefined : typeParam;
  const matrix = await stockMatrix({ keyword: params.keyword, locationType: type, page: Number(params.page) || 1, pageSize: 50, missingName });
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
        {canEditMaster && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="missing" value="1" defaultChecked={missingName} className="h-5 w-5" /> Nama belum diisi saja
          </label>
        )}
        <button className={filterButton}>Tampilkan</button>
      </form>
      <p className="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>Urut dari stok paling sedikit; yang habis di paling bawah. Angka = koli (bila isi per koli diisi) dengan total satuannya, atau langsung dalam satuan barang.</span>
        <LowChip /> <span>= sisa 1 koli atau kurang</span>
      </p>
      <ul className="aj-surface divide-y divide-slate-100 md:hidden" aria-label="Daftar stok">
        {matrix.data.map((row) => (
          <MobileStockRow
            key={row.productId}
            row={row}
            scopeLabel={scopeLabel.replace("Total ", "")}
            scopeQty={row.scopeTotal}
            scopeKoli={scopeKoli(row)}
            parts={typeParam === "STORE"
              ? [["Gudang", row.warehouseTotal, row.warehouseKoliText], ["Semua", row.total, row.totalKoliText]]
              : typeParam === "WAREHOUSE"
                ? [["Toko", row.storeTotal, row.storeKoliText], ["Semua", row.total, row.totalKoliText]]
                : [["Gudang", row.warehouseTotal, row.warehouseKoliText], ["Toko", row.storeTotal, row.storeKoliText]]}
            canMovement={canMovement}
            canEditMaster={canEditMaster}
            canAdjust={canAdjust}
          />
        ))}
        {!matrix.data.length && <li className="px-4 py-8 text-center text-sm text-slate-600">{missingName ? "Semua barang di sini sudah punya nama." : "Belum ada barang."}</li>}
      </ul>
      <div className="aj-surface hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-3 py-2">Barang</th>
              {typeParam !== "ALL" && <th className="whitespace-nowrap px-3 py-2 text-right">{scopeLabel}</th>}
              {typeParam !== "WAREHOUSE" && typeParam !== "ALL" && <th className="whitespace-nowrap px-3 py-2 text-right">Total Gudang</th>}
              {typeParam === "WAREHOUSE" && <th className="whitespace-nowrap px-3 py-2 text-right">Total Toko</th>}
              {matrix.locations.map((l) => (
                <th key={l.id} className="whitespace-nowrap px-3 py-2 text-right normal-case">
                  {canMovement ? <Link href={`/inventory/mutasi?locationId=${l.id}`} className="hover:text-emerald-800">{l.name}</Link> : l.name}
                  <div className="text-[11px] font-normal text-slate-600">{l.code}</div>
                </th>
              ))}
              <th className="sticky right-0 z-10 whitespace-nowrap border-l border-slate-200 bg-slate-50 px-3 py-2 text-right">Total Semua</th>
            </tr>
          </thead>
          <tbody>
            {matrix.data.map((row) => {
              const qty = (n: number, koli: string) => <QtyCell qty={n} koli={koli} unit={row.unit} hasKoli={Boolean(row.unitsPerKoli)} />;
              return (
                <tr key={row.productId} className={`border-t border-slate-100 ${row.lowStock ? "bg-red-50" : ""}`}>
                  <td className={`sticky left-0 z-10 px-3 py-2 ${row.lowStock ? "bg-red-50" : "bg-white"}`}>
                    <ProductCell row={row} canMovement={canMovement} canEditMaster={canEditMaster} canAdjust={canAdjust} />
                  </td>
                  {typeParam !== "ALL" && (
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${row.lowStock ? "text-red-800" : "text-slate-900"}`}>
                      {qty(row.scopeTotal, scopeKoli(row))}
                    </td>
                  )}
                  {typeParam !== "WAREHOUSE" && typeParam !== "ALL" && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(row.warehouseTotal, row.warehouseKoliText)}</td>}
                  {typeParam === "WAREHOUSE" && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(row.storeTotal, row.storeKoliText)}</td>}
                  {matrix.locations.map((l) => (
                    <td key={l.id} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.perLocation[l.id] < 0 ? "text-red-800" : ""}`}>
                      {qty(row.perLocation[l.id], row.perLocationKoli[l.id])}
                    </td>
                  ))}
                  <td className={`sticky right-0 z-10 whitespace-nowrap border-l border-slate-200 px-3 py-2 text-right font-bold tabular-nums ${row.lowStock ? "bg-red-50" : "bg-white"} ${typeParam === "ALL" && row.lowStock ? "text-red-800" : "text-slate-900"}`}>
                    {qty(row.total, row.totalKoliText)}
                  </td>
                </tr>
              );
            })}
            {!matrix.data.length && (
              <tr><td colSpan={matrix.locations.length + 4} className="px-3 py-8 text-center text-slate-600">
                {missingName ? "Semua barang di sini sudah punya nama." : "Belum ada barang."}{!missingName && can(role, "inventory.master") && <> Mulai dari <Link className="text-emerald-800 underline" href="/inventory/lokasi">Lokasi Stok</Link> lalu <Link className="text-emerald-800 underline" href="/inventory/produk">Master Barang</Link>.</>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory" params={{ keyword: params.keyword, type: typeParam, missing: missingName ? "1" : undefined }} page={matrix.meta.page} totalPages={matrix.meta.totalPages} />
    </AppShell>
  );
}

/** Stok 0 tampil "–" (bukan angka pucat); barang ber-koli tampil "N koli" dengan qty satuan di bawahnya. */
function QtyCell({ qty, koli, unit, hasKoli }: { qty: number; koli: string; unit: string; hasKoli: boolean }) {
  if (qty === 0) return <span className="text-slate-500" aria-label="0">–</span>;
  // Satuan selalu ditulis; bila ada isi per koli, total dalam satuan barang ditampilkan di bawahnya.
  if (!hasKoli || !koli.includes("koli")) return <>{fmtQty(qty)} <span className="text-xs font-normal text-slate-600">{unit}</span></>;
  return <>{koli}<div className="text-xs font-normal text-slate-600">= {fmtQty(qty)} {unit}</div></>;
}

function LowChip() {
  return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Menipis</span>;
}

type MatrixRow = { productId: string; sku: string; name: string; photoUrl?: string | null; category: string | null; hasName: boolean; unit: string; unitsPerKoli: number | null; lowStock: boolean };

/** Kode tanpa nama ditandai agar mudah dilengkapi. */
function ProductCell({ row, canMovement, canEditMaster, canAdjust }: { row: MatrixRow; canMovement: boolean; canEditMaster: boolean; canAdjust: boolean }) {
  const title = row.hasName
    ? <span className="font-semibold leading-snug text-slate-900">{row.name}</span>
    : <span className="text-sm italic text-slate-600">Nama belum diisi</span>;
  return (
    <div className="flex items-start gap-2.5">
    <ProductPhoto productId={row.productId} sku={row.sku} photoUrl={row.photoUrl} canEdit={canEditMaster} />
    <div className={row.hasName || !canEditMaster ? "min-w-[200px] max-w-[300px]" : "w-[240px] sm:w-[300px]"}>
      <div className="flex flex-wrap items-center gap-2">
        {canMovement && row.hasName ? <Link href={`/inventory/mutasi?productId=${row.productId}`} className="hover:text-emerald-800">{title}</Link> : title}
        {row.lowStock && <LowChip />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-800">{row.sku}</span>
        {row.category && <span>{row.category} ·</span>}
        <span>{row.unit}{row.unitsPerKoli ? ` · isi ${fmtQty(row.unitsPerKoli)} ${row.unit}/koli` : ""}</span>
        {canAdjust && (
          <Link href={`/inventory/adjustment?productId=${row.productId}`} className="ml-1 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-emerald-800 underline">Koreksi</Link>
        )}
      </div>
      {!row.hasName && canEditMaster && <InlineNameForm productId={row.productId} sku={row.sku} />}
    </div>
    </div>
  );
}

type MobileRow = MatrixRow & { perLocation: Record<string, number> };

/** Satu barang = satu kartu 2 baris: nama + stok lokasi yang difilter, lalu kode, lokasi lain, dan aksi. */
function MobileStockRow({ row, scopeLabel, scopeQty, scopeKoli, parts, canMovement, canEditMaster, canAdjust }: {
  row: MobileRow;
  scopeLabel: string;
  scopeQty: number;
  scopeKoli: string;
  parts: Array<[string, number, string]>;
  canMovement: boolean;
  canEditMaster: boolean;
  canAdjust: boolean;
}) {
  const short = (qty: number, koli: string) => (qty === 0 ? "–" : row.unitsPerKoli && koli.includes("koli") ? koli : `${fmtQty(qty)} ${row.unit}`);
  const name = row.hasName ? row.name : "Nama belum diisi";
  return (
    <li className={`px-4 py-3 ${row.lowStock ? "bg-red-50" : ""}`}>
      <div className="flex items-start gap-3">
        <ProductPhoto productId={row.productId} sku={row.sku} photoUrl={row.photoUrl} canEdit={canEditMaster} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {canMovement && row.hasName
              ? <Link href={`/inventory/mutasi?productId=${row.productId}`} className="truncate font-semibold text-slate-900">{name}</Link>
              : <span className={`truncate ${row.hasName ? "font-semibold text-slate-900" : "italic text-slate-600"}`}>{name}</span>}
            {row.lowStock && <LowChip />}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold text-slate-800">{row.sku}</span>
              {parts.filter(([, qty]) => qty !== 0 && qty !== scopeQty).map(([label, qty, koli]) => <span key={label}> · {label} {short(qty, koli)}</span>)}
            </span>
            {!row.hasName && canEditMaster && (
              <Link href={`/inventory/produk?keyword=${encodeURIComponent(row.sku)}&edit=${row.productId}`} className="-my-3 inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-emerald-800 underline">Isi nama</Link>
            )}
            {canAdjust && (
              <Link href={`/inventory/adjustment?productId=${row.productId}`} className="-my-3 inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-emerald-800 underline">Koreksi</Link>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-bold tabular-nums ${row.lowStock ? "text-red-800" : "text-slate-900"}`}>{short(scopeQty, scopeKoli)}</div>
          <div className="text-[11px] text-slate-500">{scopeLabel}</div>
        </div>
      </div>
    </li>
  );
}
