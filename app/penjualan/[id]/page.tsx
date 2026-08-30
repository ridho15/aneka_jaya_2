import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { salesRekeningLabel } from "@/lib/sales/rekening";
import { getSalesRecordForUser } from "@/lib/sales/access";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700"
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value}</span>;
}

function statusTone(value?: string) {
  if (value === "approved" || value === "synced" || value === "released" || value === "already_released" || value === "paid" || value === "partial") return "green";
  if (value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled") return "red";
  return "slate";
}

function stockReleaseBadge(status?: string) {
  if (status === "released" || status === "already_released") {
    return <Badge value="🟢 Terpotong (Released)" tone="green" />;
  }
  if (status === "pending") {
    return <Badge value="🟡 Pending Rilis" tone="amber" />;
  }
  if (status === "failed") {
    return <Badge value="🔴 Gagal Rilis" tone="red" />;
  }
  return <Badge value="Non-Stok" tone="slate" />;
}

export default async function SalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "penjualan.create") && !can(role, "reports.view")) redirect("/");
  const { id } = await params;
  const sale = await getSalesRecordForUser(id, user);
  if (!sale) notFound();
  const rekeningLabel = salesRekeningLabel(sale, await listAllRekeningAccounts());
  const canManage = can(role, "penjualan.manage");
  const canViewTransactionNumber = role === "OWNER";

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Detail Penjualan</p>
          <h2 className="aj-page-title text-3xl font-bold">{sale.customerName}</h2>
          {canViewTransactionNumber && <p className="mt-2 font-mono text-sm text-slate-500">{sale.transactionNumber || sale.id}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/penjualan" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Riwayat</Link>
          <Link href={`/print/sales/${sale.id}?auto=1`} target="_blank" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-xs">Cetak Langsung</Link>
          <Link href={`/print/sales/${sale.id}/continuous`} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-800 hover:bg-sky-100 shadow-xs">Cetak LX-310</Link>
          <Link href={`/print/sales/${sale.id}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Preview Cetak</Link>
          {canManage && sale.source !== "MJ" && sale.approvalStatus !== "cancelled" && (
            <Link href={`/penjualan/${sale.id}/edit`} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Edit</Link>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        {/* Card 1: Informasi Transaksi & Pelanggan */}
        <section className="aj-surface p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
            🏢 Informasi Transaksi & Pelanggan
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Tanggal Transaksi" value={sale.transactionAt ? formatJakartaDateTime(sale.transactionAt) : sale.saleDate} />
            <Info
              label="Tanggal & Jam Kirim"
              value={
                sale.deliveryAt
                  ? formatJakartaDateTime(sale.deliveryAt)
                  : sale.shippingMethod === "di Tempat"
                    ? "Langsung di Tempat"
                    : "—"
              }
            />
            <Info label="Dibuat Pada" value={sale.createdAt ? formatJakartaDateTime(sale.createdAt) : "—"} />
            <Info label="Pembuat" value={sale.createdByNameSnapshot || "—"} />
            <Info label="Customer" value={sale.customerName} />
            <Info label="Lokasi" value={sale.customerLocation || "—"} />
            <Info label="Pengiriman" value={sale.shippingMethod || "—"} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status Persetujuan</p>
              <div className="mt-1"><Badge value={sale.approvalStatus || "approved"} tone={statusTone(sale.approvalStatus || "approved")} /></div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status Cetak Struk</p>
              <div className="mt-1">
                {sale.isPrinted ? (
                  <Badge value={`🖨️ Tercetak${sale.printCount ? ` (${sale.printCount}x)` : ""}`} tone="green" />
                ) : (
                  <Badge value="Belum Dicetak" tone="slate" />
                )}
              </div>
            </div>
            {sale.printedAt && (
              <Info label="Waktu Cetak Terakhir" value={`${formatJakartaDateTime(sale.printedAt)}${sale.printedBy ? ` (${sale.printedBy})` : ""}`} />
            )}
            {sale.source === "MJ" && <Info label="Mode Integrasi MJ" value={sale.integrationProcessingMode || "slm_process_aj"} />}
          </div>
        </section>

        {/* Card 2: Pembayaran & Pembukuan Kasir */}
        <section className="aj-surface p-5 flex flex-col justify-between">
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
              💰 Pembayaran & Pembukuan Kasir
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="Tipe Penjualan" value={sale.tipeNameSnapshot ? `${sale.tipeNameSnapshot} (${sale.tipeCodeSnapshot || sale.tipeId})` : (sale.tipeCodeSnapshot || sale.tipeId || "—")} />
              <Info label="Metode Pembayaran" value={sale.paymentMethod} />
              <Info label="Rekening Digunakan" value={rekeningLabel} />
              <Info label="Total Penjualan" value={rupiah(sale.total)} strong />
              {sale.paymentMethod === "Tempo" && (
                <>
                  <Info label="Pembayaran Awal / DP" value={rupiah(sale.initialPaymentAmount || 0)} strong />
                  <Info label="Sisa Tempo" value={rupiah(Math.max(0, sale.total - (sale.initialPaymentAmount || 0)))} strong />
                  {sale.dueDate && <Info label="Jatuh Tempo" value={formatJakartaDateTime(sale.dueDate)} />}
                  {sale.initialPaymentRekeningNameSnapshot && <Info label="Rekening DP" value={sale.initialPaymentRekeningNameSnapshot} />}
                </>
              )}
            </div>
            {sale.notes && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Info label="Catatan Transaksi" value={sale.notes} />
              </div>
            )}
          </div>
          {canManage && sale.source !== "MJ" && (
            <div className="mt-5 pt-3 border-t border-slate-100">
              <TransactionCancelButton
                id={sale.id}
                kind="sales"
                disabled={sale.approvalStatus === "cancelled"}
                disabledReason="Transaksi sudah dibatalkan."
              />
            </div>
          )}
        </section>
      </div>

      {/* Card 3: Integrasi Stok Gudang Aneka Jaya (AJ ERP) */}
      <section className="aj-surface mb-5 p-5 border-l-4 border-emerald-500">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
          📦 Integrasi Gudang Aneka Jaya (AJ ERP)
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Transaksi kasir memotong stok fisik secara langsung di gudang pusat Aneka Jaya dan mencatat kartu stok otomatis.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status Rilis Stok</p>
            <div className="mt-1">{stockReleaseBadge(sale.stockReleaseStatus)}</div>
          </div>
          <Info label="Referensi Rilis Stok AJ" value={sale.stockReleaseReference || "—"} />
          <Info label="Waktu Rilis Fisik" value={sale.stockReleasedAt ? formatJakartaDateTime(sale.stockReleasedAt) : "—"} />
        </div>
        {sale.stockReleaseError && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            {sale.stockReleaseError}
          </p>
        )}
      </section>

      {/* Section 4: Rincian Barang */}
      <section className="aj-surface overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4 font-bold text-slate-900">Item Barang ({sale.items.length})</div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Produk / SKU</th>
              <th className="px-5 py-3">Lokasi Stok</th>
              <th className="px-5 py-3 text-right">Qty</th>
              <th className="px-5 py-3">Satuan</th>
              <th className="px-5 py-3 text-right">Harga</th>
              <th className="px-5 py-3 text-right">Diskon</th>
              <th className="px-5 py-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, index) => (
              <tr key={`${item.productRef}-${index}`} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-4 font-semibold text-slate-900">
                  {item.manualProduct?.name || item.productRef}
                  {item.manualProduct?.sku && item.manualProduct.sku !== item.productRef && (
                    <span className="block text-xs text-slate-500 font-normal">SKU: {item.manualProduct.sku}</span>
                  )}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {[item.warehouseNameSnapshot, item.rackNameSnapshot].filter(Boolean).join(" / ") || "Gudang Utama"}
                </td>
                <td className="px-5 py-4 text-right font-medium">{item.quantity}</td>
                <td className="px-5 py-4 text-slate-600">{item.unitSnapshot || "Pcs"}</td>
                <td className="px-5 py-4 text-right">{rupiah(item.unitPrice)}</td>
                <td className="px-5 py-4 text-right">{rupiah(item.discount || 0)}</td>
                <td className="px-5 py-4 text-right font-semibold text-slate-900">{rupiah(item.quantity * item.unitPrice - (item.discount || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 ${strong ? "text-lg font-bold text-slate-900" : "text-sm text-slate-700"}`}>{value}</p>
    </div>
  );
}
