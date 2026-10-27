import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { getBalanceSheet } from "@/lib/reports/financialStatements";
import { BalanceSheetViewer } from "@/components/reports/BalanceSheetViewer";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage() {
  await requirePermission("reports.finance_view");

  const [initialReport, tipeOptions] = await Promise.all([
    getBalanceSheet(),
    prisma.bookkeepingType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" }
    })
  ]);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-emerald-700">
          PUSAT LAPORAN KEUANGAN
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Laporan Neraca (Balance Sheet)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Posisi aset, liabilitas, dan ekuitas perusahaan dengan pembuktian otomatis keseimbangan persamaan akuntansi (Equilibrium).
        </p>
      </div>

      <BalanceSheetViewer
        initialReport={initialReport}
        tipeOptions={tipeOptions}
      />
    </AppShell>
  );
}
