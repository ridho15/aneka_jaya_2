import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getTempoReceivable, listTempoPaymentReversals, listTempoPayments } from "@/lib/tempo/store";
import { getSalesRecord } from "@/lib/sales/store";
import { listRekeningAccounts } from "@/lib/business/masterData";
import { TempoPayForm } from "@/components/tempo/TempoPayForm";
import { TempoActionForm } from "@/components/tempo/TempoActionForm";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const configs: Record<string, { label: string; bg: string; text: string; border: string }> = {
    paid: { label: "Lunas (Paid)", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    partial_paid: { label: "Sebagian (Partial)", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    overdue: { label: "Jatuh Tempo (Overdue)", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    open: { label: "Belum Dibayar (Open)", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    cancelled: { label: "Dibatalkan", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
    written_off: { label: "Dihapus (Write-off)", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" }
  };
  const config = configs[status] || { label: status, bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

function methodBadge(method: string) {
  if (method === "TF") return <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 border border-sky-200">Transfer</span>;
  if (method === "Cash") return <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">Tunai</span>;
  return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">{method}</span>;
}

export default async function TempoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getCurrentRole();
  if (!can(role, "tempo.view")) redirect("/");
  const [tempo, rekenings] = await Promise.all([getTempoReceivable(id), listRekeningAccounts()]);
  if (!tempo) redirect("/tempo");
  const [payments, reversals, sale] = await Promise.all([
    listTempoPayments(tempo.id),
    listTempoPaymentReversals(),
    tempo.salesId ? getSalesRecord(tempo.salesId) : undefined
  ]);

  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

  const percentagePaid = tempo.originalAmount > 0 ? Math.min(100, Math.round((tempo.paidAmount / tempo.originalAmount) * 100)) : 0;
  const isPaid = tempo.status === "paid" || tempo.remainingAmount <= 0;
  const totalItemQty = sale?.items?.reduce((sum, it) => sum + it.quantity, 0) || 0;

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Piutang • Tempo</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-xs font-semibold text-slate-500">{tempo.id}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{tempo.customerName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tipe Pembukuan: <span className="font-semibold text-slate-700">{tempo.tipeNameSnapshot || tempo.tipeCodeSnapshot}</span>
            {sale?.customerLocation && <span> • Lokasi: <span className="font-semibold text-slate-700">{sale.customerLocation}</span></span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/tempo"
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            ← Kembali
          </Link>
          {tempo.salesId && (
            <Link
              href={`/penjualan/${tempo.salesId}`}
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Nota Penjualan
            </Link>
          )}
          <Link
            href={`/print/tempo/${tempo.id}`}
            className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
          >
            Cetak Nota
          </Link>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Tagihan */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Tagihan Awal</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{rupiah(tempo.originalAmount)}</p>
          <p className="mt-1 text-xs text-slate-400">Nilai total faktur penjualan</p>
        </div>

        {/* Card 2: Sudah Dibayar */}
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Sudah Dibayar</p>
            <span className="text-xs font-extrabold text-emerald-700">{percentagePaid}%</span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{rupiah(tempo.paidAmount)}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/60">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${percentagePaid}%` }} />
          </div>
        </div>

        {/* Card 3: Sisa Piutang */}
        <div className={`rounded-2xl border p-5 shadow-xs ${
          isPaid
            ? "border-emerald-200/80 bg-emerald-50/30"
            : "border-amber-200/80 bg-amber-50/40"
        }`}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Sisa Tagihan Tempo</p>
          <p className={`mt-2 text-2xl font-black ${isPaid ? "text-emerald-700" : "text-amber-700"}`}>
            {rupiah(tempo.remainingAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{isPaid ? "Tagihan sudah lunas sepenuhnya" : "Wajib dilunasi pelanggan"}</p>
        </div>

        {/* Card 4: Jatuh Tempo & Status */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Status & Jatuh Tempo</p>
            <div className="mt-2">{statusBadge(tempo.status)}</div>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600">
            Jatuh Tempo: <b className="text-slate-800">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(tempo.dueDate))}</b>
          </p>
        </div>
      </div>

      {/* Main Grid: Left Details & Right Form */}
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        {/* Left Column: Details, Purchased Items Table, & Payment Timeline */}
        <div className="space-y-6">
          {/* Card 1: Informasi Detail Tempo */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              Informasi Piutang & Transaksi
            </h3>
            <dl className="grid gap-4 sm:grid-cols-2 text-sm">
              <Info label="Customer" value={tempo.customerName} />
              <Info label="Tipe Pembukuan" value={`${tempo.tipeCodeSnapshot} — ${tempo.tipeNameSnapshot || tempo.tipeCodeSnapshot}`} />
              <Info label="Tanggal Transaksi" value={new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(tempo.transactionDate))} />
              <Info label="Tanggal Jatuh Tempo" value={new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(tempo.dueDate))} />
              <Info label="Dibuat Oleh" value={tempo.createdByNameSnapshot || "—"} />
              {sale?.customerLocation && <Info label="Lokasi Pelanggan" value={sale.customerLocation} />}
              {sale?.shippingMethod && <Info label="Metode Pengiriman" value={sale.shippingMethod} />}
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Nota Penjualan Asal</dt>
                <dd className="mt-1">
                  {tempo.salesId ? (
                    <Link href={`/penjualan/${tempo.salesId}`} className="font-semibold text-emerald-700 hover:underline">
                      {sale?.transactionNumber ? `${sale.transactionNumber} (${tempo.salesId})` : tempo.salesId} ↗
                    </Link>
                  ) : "—"}
                </dd>
              </div>
            </dl>
            {sale?.notes && (
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-bold text-slate-400 uppercase tracking-wider">Catatan Nota: </span>
                <span className="italic text-slate-800">"{sale.notes}"</span>
              </div>
            )}
          </section>

          {/* Card 2: Rincian Barang yang Di-Tempo */}
          {sale?.items && sale.items.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  Rincian Barang yang Di-Tempo
                </h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {sale.items.length} Macam Barang ({totalItemQty} Pcs)
                </span>
              </div>
              <div className="overflow-x-auto">
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
                  <tbody className="divide-y divide-slate-100">
                    {sale.items.map((item, index) => {
                      const itemSubtotal = item.quantity * item.unitPrice - (item.discount || 0);
                      return (
                        <tr key={`${item.productRef}-${index}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {item.manualProduct?.name || item.productRef}
                            {item.manualProduct?.sku && item.manualProduct.sku !== item.productRef && (
                              <span className="block text-xs text-slate-500 font-normal">SKU: {item.manualProduct.sku}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {[item.warehouseNameSnapshot, item.rackNameSnapshot].filter(Boolean).join(" / ") || "Gudang Utama"}
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-900">{item.quantity}</td>
                          <td className="px-5 py-3.5 text-slate-600 text-xs">{item.unitSnapshot || "Pcs"}</td>
                          <td className="px-5 py-3.5 text-right text-slate-700">{rupiah(item.unitPrice)}</td>
                          <td className="px-5 py-3.5 text-right text-slate-500">{item.discount ? rupiah(item.discount) : "—"}</td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-900">{rupiah(itemSubtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50/80 font-bold text-slate-900">
                    <tr>
                      <td colSpan={2} className="px-5 py-3 text-xs uppercase tracking-wider text-slate-500">Total Tagihan Barang</td>
                      <td className="px-5 py-3 text-right">{totalItemQty}</td>
                      <td colSpan={3}></td>
                      <td className="px-5 py-3 text-right text-base text-emerald-800">{rupiah(sale.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Card 3: Riwayat Pembayaran */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                Riwayat Pembayaran & Cicilan
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {payments.length} Transaksi
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {payments.map((payment, index) => (
                <div key={payment.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                        {index + 1}
                      </span>
                      <b className="text-base font-extrabold text-slate-900">{rupiah(payment.amountPaid)}</b>
                      {methodBadge(payment.paymentMethod)}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(payment.paymentDate))}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>Rekening: <b className="text-slate-800">{payment.rekeningNameSnapshot || "—"}</b></span>
                    {payment.notes && <span>Catatan: <i className="text-slate-700">"{payment.notes}"</i></span>}
                    {payment.createdByNameSnapshot && <span>Diterima oleh: <b className="text-slate-700">{payment.createdByNameSnapshot}</b></span>}
                  </div>

                  {/* ERP Payment Status if applicable */}
                  {payment.erpPaymentStatus && payment.erpPaymentStatus !== "not_required" && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                      <span>Sync ERP:</span>
                      <b className={payment.erpPaymentStatus === "paid" ? "text-emerald-700 font-bold" : payment.erpPaymentStatus === "failed" ? "text-rose-700 font-bold" : "text-amber-700 font-bold"}>
                        {payment.erpPaymentStatus}
                      </b>
                      {payment.erpPaymentError && <span className="text-rose-600">({payment.erpPaymentError})</span>}
                    </div>
                  )}

                  {/* Reversals */}
                  {reversals.filter((reversal) => reversal.tempoPaymentId === payment.id).map((reversal) => (
                    <div key={reversal.id} className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                      <b>Reversal {rupiah(reversal.amount)}</b> • {reversal.reversalDate} • {reversal.reason} ({reversal.erpStatus})
                    </div>
                  ))}
                </div>
              ))}

              {payments.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">
                  Belum ada pembayaran atau DP tercatat untuk tempo ini.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Actions / Payment Form */}
        <div className="space-y-4">
          {!isPaid && !["cancelled", "written_off"].includes(tempo.status) ? (
            <>
              {can(role, "tempo.mark_paid") && (
                <TempoPayForm
                  tempoId={tempo.id}
                  remainingAmount={tempo.remainingAmount}
                  tipeId={tempo.tipeId}
                  rekenings={rekenings}
                />
              )}
              {can(role, "tempo.cancel") && <TempoActionForm tempoId={tempo.id} action="cancel" />}
              {can(role, "tempo.write_off") && tempo.remainingAmount > 0 && (
                <TempoActionForm tempoId={tempo.id} action="write-off" />
              )}
            </>
          ) : isPaid ? (
            <div className="rounded-2xl border border-emerald-200 bg-linear-to-b from-white to-emerald-50/50 p-6 text-center shadow-xs">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-emerald-900">Tagihan Sudah Lunas!</h3>
              <p className="mt-1 text-xs text-slate-600">
                Seluruh kewajiban piutang customer {tempo.customerName} telah terbayar penuh sebesar <b>{rupiah(tempo.originalAmount)}</b>.
              </p>
              <Link
                href={`/print/tempo/${tempo.id}`}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
              >
                Cetak Bukti Pelunasan
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
              <p className="text-sm font-bold">Status Tagihan: {tempo.status}</p>
              <p className="mt-1 text-xs text-slate-500">Tidak ada tindakan pembayaran yang tersedia.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}


