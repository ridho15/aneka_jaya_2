import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listJournalEntries } from "@/lib/accounting/journalStore";
import { listAccounts, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { JournalOverviewTable } from "@/components/accounting/JournalOverviewTable";

export const dynamic = "force-dynamic";

export default async function AkuntansiJurnalPage() {
  await requirePermission("accounting.view");
  await ensureStandardAccounts();

  const [journalResult, rawAccounts] = await Promise.all([
    listJournalEntries({ pageSize: 200 }),
    listAccounts({ isActive: true }),
  ]);

  const journals = journalResult.entries.map((j) => ({
    id: j.id,
    entryNumber: j.journalNumber,
    entryDate: j.entryDate.toISOString(),
    sourceType: j.sourceType,
    sourceId: j.sourceId,
    sourceRef: j.sourceId,
    description: j.description,
    status: j.status as "POSTED" | "REVERSED",
    reversedAt: j.reversedByJournalId ? j.updatedAt.toISOString() : null,
    reversalReason: j.reversalReason,
    createdByName: j.createdByNameSnapshot,
    lines: j.lines.map((l) => ({
      id: l.id,
      lineNumber: l.sortOrder + 1,
      description: l.memo,
      debit: Number(l.debit),
      credit: Number(l.credit),
      account: {
        id: l.account.id,
        code: l.account.code,
        name: l.account.name,
        category: l.account.category,
        normalBalance: l.account.normalBalance,
      },
    })),
  }));

  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
  }));

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
          Akuntansi & Pembukuan
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Jurnal Transaksi Umum</h2>
        <p className="mt-2 text-sm text-slate-600">
          Pencatatan ayat jurnal berpasangan (double-entry), penyesuaian manual, dan histori jurnal otomatis operasional.
        </p>
      </div>

      <JournalOverviewTable initialJournals={journals} accounts={accounts} />
    </AppShell>
  );
}
