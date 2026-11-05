import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryDocumentForm } from "@/components/inventory/InventoryDocumentForm";
import { GrnPostAll, GrnPostForm } from "@/components/inventory/GrnPostForm";
import { InventoryHeader, fmtDate, fmtQty } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listLocations, listPendingPurchaseReceipts, listProductOptions, listStockInHistory } from "@/lib/inventory/service";

export const dynamic = "force-dynamic";

export default async function BarangMasukPage() {
  const role = await getCurrentRole();
  if (!can(role, "inventory.receive")) redirect("/no-access");
  const [locations, products, pending, history] = await Promise.all([listLocations(), listProductOptions(), listPendingPurchaseReceipts(), listStockInHistory()]);
  return (
    <AppShell>
      <InventoryHeader title="Barang Masuk" description={<>Catat barang yang baru tiba di gudang atau toko. Barang dari PO yang sudah diterima di Pembelian muncul di bawah: pilih lokasi lalu klik <b>Masukkan ke stok</b>. Barang tanpa PO: isi form manual.</>} />

      <section className="mb-8">
        <h3 className="mb-3 font-bold text-slate-800">Penerimaan Pembelian (GRN) belum masuk stok</h3>
        {pending.length > 1 && locations.length > 0 && <GrnPostAll receiptIds={pending.map((r) => r.id)} locations={locations} />}
        <div className="aj-surface overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr><th className="px-3 py-2">GRN</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">PO / Supplier</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2">Masukkan ke</th></tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">{r.grnNumber}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.receiptDate)}</td>
                  <td className="px-3 py-2">{r.purchaseOrder.poNumber}<div className="text-xs text-slate-500">{r.purchaseOrder.supplier.name}</div></td>
                  <td className="px-3 py-2 text-xs">{r.items.map((i, idx) => <div key={idx}>{i.itemCode} · {i.itemName}: <b>{fmtQty(Number(i.quantityReceived))}</b> {i.unit}</div>)}</td>
                  <td className="px-3 py-2">{locations.length ? <GrnPostForm receiptId={r.id} locations={locations} /> : <span className="text-xs text-slate-500">Buat gudang dulu</span>}</td>
                </tr>
              ))}
              {!pending.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Semua GRN sudah masuk stok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <h3 className="mb-3 font-bold text-slate-800">Barang masuk manual (tanpa PO)</h3>
      <InventoryDocumentForm mode="stock-in" locations={locations} products={products} />

      <section className="mt-8">
        <h3 className="mb-3 font-bold text-slate-800">Riwayat Barang Masuk</h3>
        <div className="aj-surface overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">No. Referensi</th><th className="px-3 py-2">Sumber</th><th className="px-3 py-2">Lokasi</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2 text-right">Nilai Modal</th><th className="px-3 py-2">Oleh</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.key} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(h.movementDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">{h.referenceNumber}</td>
                  <td className="px-3 py-2 text-xs">{h.referenceType === "PURCHASE_RECEIPT" ? "Dari PO" : "Manual"}</td>
                  <td className="px-3 py-2">{h.locationCode}</td>
                  <td className="px-3 py-2 text-xs">{h.items.map((i, idx) => <div key={idx}>{i.sku} · {i.name}: <b>{fmtQty(i.quantity)}</b> {i.unit}{i.koliText.includes("koli") ? ` (${i.koliText})` : ""}</div>)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{h.totalValue ? `Rp ${h.totalValue.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-3 py-2 text-xs">{h.createdByName ?? "-"}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Belum ada barang masuk.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
