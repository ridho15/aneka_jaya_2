import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listAccounts, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { AccountManagerTable } from "@/components/accounting/AccountManagerTable";

export const dynamic = "force-dynamic";

export default async function AkuntansiCoaPage() {
  await requirePermission("accounting.coa.manage");
  await ensureStandardAccounts();

  const rawAccounts = await listAccounts();
  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    description: a.description,
    isSystem: a.isSystem,
    isActive: a.isActive,
  }));

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Pembukuan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Bagan Akun (Chart of Accounts)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Struktur kode akun perkiraan standar UKM (Aset, Kewajiban, Ekuitas, Pendapatan, dan Beban) untuk pemetaan jurnal umum.
        </p>
      </div>

      <AccountManagerTable initialAccounts={accounts} />
    </AppShell>
  );
}
