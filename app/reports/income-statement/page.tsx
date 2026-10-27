import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { getIncomeStatement } from "@/lib/reports/financialStatements";
import { IncomeStatementViewer } from "@/components/reports/IncomeStatementViewer";

export const dynamic = "force-dynamic";

export default async function IncomeStatementPage() {
  await requirePermission("reports.finance_view");

  const [initialReport, tipeOptions] = await Promise.all([
    getIncomeStatement(),
    prisma.bookkeepingType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" }
    })
  ]);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-emerald-400">
          PUSAT LAPORAN KEUANGAN
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Laporan Laba Rugi (P&L)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kalkulasi pendapatan bersih, harga pokok penjualan riil (COGS), beban operasional, serta laba/rugi bersih berbasis double-entry.
        </p>
      </div>

      <IncomeStatementViewer
        initialReport={initialReport}
        tipeOptions={tipeOptions}
      />
    </AppShell>
  );
}
