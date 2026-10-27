import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { getAccountingReconciliationReport } from "@/lib/accounting/reconciliationStore";
import { ReconciliationView } from "@/components/accounting/ReconciliationView";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AkuntansiRekonsiliasiPage() {
  await requirePermission("accounting.view");
  await ensureStandardAccounts();

  const report = await getAccountingReconciliationReport();

  let employees: Array<{ id: string; name: string }> = [];
  if (typeof prisma?.employee?.findMany === "function") {
    employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
  }

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Audit Keuangan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Rekonsiliasi Subledger & Review Historis</h2>
        <p className="mt-2 text-sm text-slate-600">
          Verifikasi keseimbangan saldo antara subledger operasional (Kasbon, Uang Muka, Simpanan, Utang, Piutang) dengan Buku Besar, serta penelaahan manual pengeluaran historis.
        </p>
      </div>

      <ReconciliationView initialReport={report} employees={employees} />
    </AppShell>
  );
}
