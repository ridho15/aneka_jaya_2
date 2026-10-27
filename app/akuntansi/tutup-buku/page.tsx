import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listAccountingPeriods } from "@/lib/accounting/periodStore";
import { PeriodClosingView } from "@/components/accounting/PeriodClosingView";

export const dynamic = "force-dynamic";

export default async function AkuntansiTutupBukuPage() {
  await requirePermission("accounting.period.manage");

  const rawPeriods = await listAccountingPeriods();
  const periods = rawPeriods.map((p) => ({
    id: p.periodKey,
    periodKey: p.periodKey,
    isClosed: p.isClosed,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    closedByNameSnapshot: p.closedByNameSnapshot,
    notes: p.notes,
  }));

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Pembukuan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Tutup Buku Periode</h2>
        <p className="mt-2 text-sm text-slate-600">
          Kunci periode bulanan akuntansi untuk menjaga integritas pembukuan dan mencegah manipulasi transaksi masa lalu.
        </p>
      </div>

      <PeriodClosingView initialPeriods={periods} />
    </AppShell>
  );
}
