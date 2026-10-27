import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { listSavingsAccounts, getSavingsSummary, listSavingsTransactions } from "@/lib/sdm/savingsStore";
import { listEmployees } from "@/lib/sdm/employeeStore";
import { SavingsManager } from "@/components/sdm/SavingsManager";

export const dynamic = "force-dynamic";

export default async function SavingsPage() {
  await requirePermission("sdm.view");

  const [accounts, summary, transactions, employees, rekenings] = await Promise.all([
    listSavingsAccounts(),
    getSavingsSummary(),
    listSavingsTransactions({ limit: 50 }),
    listEmployees({ isActive: true }),
    prisma.rekeningAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, bankName: true, accountNumber: true },
      orderBy: { name: "asc" }
    })
  ]);

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: e.name,
    nik: e.nik,
    department: e.department
  }));

  const rekeningOptions = rekenings.map((r) => ({
    id: r.id,
    name: r.name,
    bankName: r.bankName,
    accountNumber: r.accountNumber
  }));

  return (
    <AppShell>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-emerald-700">
          SDM & KESEJAHTERAAN
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Simpanan Karyawan</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pengelolaan tabungan internal karyawan, pencatatan setoran & penarikan, serta integrasi buku jurnal otomatis (Double-Entry COA 2-1003).
        </p>
      </div>

      <SavingsManager
        initialAccounts={accounts as any}
        initialSummary={summary}
        initialTransactions={transactions as any}
        employees={employeeOptions}
        rekenings={rekeningOptions}
      />
    </AppShell>
  );
}
