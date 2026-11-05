import { redirect } from "next/navigation";
import type { InventoryMovementType } from "@prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryHeader, MOVEMENT_LABEL, Pager, filterInput, fmtDate, fmtQty } from "@/components/inventory/ui";
import { locationLabel } from "@/components/inventory/labels";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations, listMovements, listProductOptions } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";
type SP = Promise<{ productId?: string; locationId?: string; type?: string; reference?: string; from?: string; to?: string; page?: string }>;

export default async function MutasiStokPage({ searchParams }: { searchParams: SP }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.view")) redirect("/no-access");
  const p = await searchParams;
  const type = p.type && p.type in MOVEMENT_LABEL ? (p.type as InventoryMovementType) : undefined;
  const [locations, products, result] = await Promise.all([
    listLocations({ includeInactive: true }),
    listProductOptions(),
    listMovements({ productId: p.productId, locationId: p.locationId, type, referenceNumber: p.reference, from: p.from, to: p.to, page: Number(p.page) || 1, pageSize: 50 })
  ]);
  const isCard = Boolean(p.productId && p.locationId);
  return (
    <AppShell>
      <InventoryHeader title="Mutasi / Kartu Stok" description="Riwayat semua pergerakan stok: barang masuk, transfer, penjualan, opname, dan adjustment. Pilih satu barang + satu lokasi untuk melihat kartu stok dengan saldo berjalan." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="productId" defaultValue={p.productId ?? ""} className={`${filterInput} max-w-xs`}>
          <option value="">Semua barang</option>
          {products.map((x) => <option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}
        </select>
        <select name="locationId" defaultValue={p.locationId ?? ""} className={filterInput}>
          <option value="">Semua lokasi</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{locationLabel(l)}</option>)}
        </select>
        <select name="type" defaultValue={type ?? ""} className={filterInput}>
          <option value="">Semua jenis</option>
          {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="reference" defaultValue={p.reference} placeholder="No. referensi" className={filterInput} />
        <input type="date" name="from" defaultValue={p.from} className={filterInput} />
        <input type="date" name="to" defaultValue={p.to} className={filterInput} />
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Jenis</th><th className="px-3 py-2">Referensi</th>
              <th className="px-3 py-2">Barang</th><th className="px-3 py-2">Lokasi</th>
              <th className="px-3 py-2 text-right">Masuk</th><th className="px-3 py-2 text-right">Keluar</th>
              <th className="px-3 py-2 text-right">{isCard ? "Saldo" : "Saldo Lokasi"}</th><th className="px-3 py-2">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(m.movementDate)}</td>
                <td className="whitespace-nowrap px-3 py-2">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{m.referenceNumber}</td>
                <td className="px-3 py-2"><div className="font-semibold">{m.productName}</div><div className="text-xs text-slate-500">{m.sku}</div></td>
                <td className="whitespace-nowrap px-3 py-2">{m.locationCode}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{m.quantityIn ? fmtQty(m.quantityIn) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{m.quantityOut ? fmtQty(m.quantityOut) : ""}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtQty(m.balanceAfter)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{m.notes}{m.createdByName && <div className="text-slate-400">oleh {m.createdByName}</div>}</td>
              </tr>
            ))}
            {!result.data.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Belum ada mutasi.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory/mutasi" params={{ productId: p.productId, locationId: p.locationId, type, reference: p.reference, from: p.from, to: p.to }} page={result.meta.page} totalPages={result.meta.totalPages} />
    </AppShell>
  );
}
