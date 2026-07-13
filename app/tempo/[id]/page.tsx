import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getTempoReceivable, listTempoPayments } from "@/lib/tempo/store";
import { listRekeningAccounts } from "@/lib/business/masterData";
import { TempoPayForm } from "@/components/tempo/TempoPayForm";
import { TempoActionForm } from "@/components/tempo/TempoActionForm";

export const dynamic = "force-dynamic";

export default async function TempoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getCurrentRole();
  if (!can(role, "tempo.view")) redirect("/");
  const [tempo, rekenings] = await Promise.all([getTempoReceivable(id), listRekeningAccounts()]);
  if (!tempo) redirect("/tempo");
  const payments = await listTempoPayments(tempo.id);
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

  return (
    <AppShell>
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Tempo</p>
          <h2 className="aj-page-title text-3xl font-bold">Bayar Tempo</h2>
          <p className="mt-2 text-sm text-slate-600">{tempo.customerName} • Sisa {rupiah(tempo.remainingAmount)}</p>
        </div>
        <Link
          href={`/print/tempo/${tempo.id}`}
          className="inline-flex items-center justify-center border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
        >
          Cetak
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <section className="aj-surface p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Info label="Customer" value={tempo.customerName} />
            <Info label="Tipe" value={tempo.tipeCodeSnapshot} />
            <Info label="Total tagihan" value={rupiah(tempo.originalAmount)} />
            <Info label="Sudah dibayar" value={rupiah(tempo.paidAmount)} />
            <Info label="Sisa tagihan" value={rupiah(tempo.remainingAmount)} />
            <Info label="Status" value={tempo.status} />
            {tempo.dueDate && <Info label="Jatuh tempo" value={new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(tempo.dueDate))} />}
          </dl>
          <h3 className="mt-8 font-bold">Riwayat Pembayaran</h3>
          <div className="mt-3 divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <b>{rupiah(payment.amountPaid)}</b>
                  <span className="text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(payment.paymentDate))}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{payment.paymentMethod} • {payment.rekeningNameSnapshot}{payment.notes ? ` • ${payment.notes}` : ""}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">Payment ERP: {payment.erpPaymentStatus || "not_required"}{payment.erpPaymentError ? ` • ${payment.erpPaymentError}` : ""}</p>
              </div>
            ))}
            {payments.length === 0 && <p className="py-3 text-sm text-slate-500">Belum ada pembayaran.</p>}
          </div>
        </section>
        {!["paid", "cancelled", "written_off"].includes(tempo.status) && (
          <div className="space-y-4">
            {can(role, "tempo.mark_paid") && <TempoPayForm tempoId={tempo.id} remainingAmount={tempo.remainingAmount} tipeId={tempo.tipeId} rekenings={rekenings} />}
            {can(role, "tempo.cancel") && <TempoActionForm tempoId={tempo.id} action="cancel" />}
            {can(role, "tempo.write_off") && tempo.remainingAmount > 0 && <TempoActionForm tempoId={tempo.id} action="write-off" />}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
