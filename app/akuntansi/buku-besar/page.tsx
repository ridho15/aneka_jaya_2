import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listAccounts, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { getGeneralLedger } from "@/lib/accounting/ledgerStore";
import { GeneralLedgerView } from "@/components/accounting/GeneralLedgerView";
import { jakartaDateKey } from "@/lib/date/jakarta";

export const dynamic = "force-dynamic";

export default async function AkuntansiBukuBesarPage() {
  await requirePermission("accounting.view");
  await ensureStandardAccounts();

  const rawAccounts = await listAccounts({ isActive: true });
  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
  }));

  const initialAccount = accounts[0];
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const initialStartDate = `${year}-${month}-01`;
  const initialEndDate = jakartaDateKey(today);

  let initialReport = null;
  if (initialAccount) {
    initialReport = await getGeneralLedger(initialAccount.id, {
      startDate: initialStartDate,
      endDate: initialEndDate,
    });
  }

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Pembukuan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Buku Besar (General Ledger)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Histori pergerakan mutasi debit, kredit, dan saldo berjalan (running balance) per akun perkiraan.
        </p>
      </div>

      {initialAccount && initialReport ? (
        <GeneralLedgerView
          accounts={accounts}
          initialAccountId={initialAccount.id}
          initialStartDate={initialStartDate}
          initialEndDate={initialEndDate}
          initialReport={initialReport}
        />
      ) : (
        <div className="aj-surface p-8 text-center text-slate-500">
          Belum ada akun perkiraan terdaftar dalam sistem.
        </div>
      )}
    </AppShell>
  );
}
