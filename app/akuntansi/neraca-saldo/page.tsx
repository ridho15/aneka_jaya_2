import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { getTrialBalance } from "@/lib/accounting/ledgerStore";
import { TrialBalanceTable } from "@/components/accounting/TrialBalanceTable";

export const dynamic = "force-dynamic";

export default async function AkuntansiNeracaSaldoPage() {
  await requirePermission("accounting.view");
  await ensureStandardAccounts();

  const report = await getTrialBalance();

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Pembukuan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Neraca Saldo (Trial Balance)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Daftar seluruh akun perkiraan beserta mutasi dan saldo akhir untuk memverifikasi keseimbangan debit dan kredit.
        </p>
      </div>

      <TrialBalanceTable initialReport={report} />
    </AppShell>
  );
}
