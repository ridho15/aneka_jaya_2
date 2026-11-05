import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryDocumentForm } from "@/components/inventory/InventoryDocumentForm";
import { InventoryActionButton } from "@/components/inventory/InventoryActionButton";
import { InventoryHeader, Pager, filterInput, fmtDate, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations, listProductOptions, listTransfers } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";
type SP = Promise<{ status?: string; page?: string }>;
const STATUS_LABEL = { IN_TRANSIT: "Dalam Perjalanan", RECEIVED: "Diterima", CANCELLED: "Dibatalkan" } as const;

export default async function TransferPage({ searchParams }: { searchParams: SP }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.transfer")) redirect("/no-access");
  const p = await searchParams;
  const status = p.status && p.status in STATUS_LABEL ? (p.status as keyof typeof STATUS_LABEL) : undefined;
  const canTransfer = can(role, "inventory.transfer");
  const [locations, products, result] = await Promise.all([listLocations(), listProductOptions(), listTransfers({ status, page: Number(p.page) || 1 })]);
  return (
    <AppShell>
      <InventoryHeader title="Transfer Antar Gudang / Toko" description="Pindahkan stok antar gudang dan toko. Transfer bisa langsung diterima, atau berstatus 'Dalam Perjalanan' sampai dikonfirmasi diterima di lokasi tujuan." />
      {canTransfer && <div className="mb-8"><InventoryDocumentForm mode="transfer" locations={locations} products={products} /></div>}
      <form className="mb-3 flex gap-2">
        <select name="status" defaultValue={status ?? ""} className={filterInput}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="aj-surface overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">No. Transfer</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Dari → Ke</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {result.data.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{t.transferNumber}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(t.transferDate)}</td>
                <td className="whitespace-nowrap px-3 py-2">{t.fromLocation?.code} → {t.toLocation?.code}</td>
                <td className="px-3 py-2 text-xs">{t.items.map((i) => <div key={i.id}>{i.sku} — {i.productName}: <b>{fmtQty(i.quantity)}</b> {i.unit}{i.koliText?.includes("koli") ? ` (${i.koliText})` : ""}</div>)}</td>
                <td className="px-3 py-2">{STATUS_LABEL[t.status]}{t.createdByName && <div className="text-xs text-slate-400">oleh {t.createdByName}</div>}</td>
                <td className="px-3 py-2">
                  {canTransfer && t.status === "IN_TRANSIT" && (
                    <div className="flex gap-2">
                      <InventoryActionButton endpoint={`/api/inventory/transfers/${t.id}/receive`} label="Terima" confirmText={`Konfirmasi barang transfer ${t.transferNumber} sudah diterima?`} />
                      <InventoryActionButton endpoint={`/api/inventory/transfers/${t.id}/cancel`} label="Batalkan" askReason confirmText="Alasan pembatalan transfer:" variant="danger" />
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!result.data.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Belum ada transfer.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/inventory/transfer" params={{ status }} page={result.meta.page} totalPages={result.meta.totalPages} />
    </AppShell>
  );
}
