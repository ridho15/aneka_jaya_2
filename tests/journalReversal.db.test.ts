/** Pembalikan jurnal tidak boleh mengurangi saldo dua kali (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("journal reversal (postgres)", () => {
  let journal: typeof import("@/lib/accounting/journalStore");
  let ledger: typeof import("@/lib/accounting/ledgerStore");
  let accounts: typeof import("@/lib/accounting/accountStore");
  const actor = { id: "test", name: "Test", role: "OWNER" as const };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    journal = await import("@/lib/accounting/journalStore");
    ledger = await import("@/lib/accounting/ledgerStore");
    accounts = await import("@/lib/accounting/accountStore");
  });

  it("original + reversal net to zero in the general ledger", async () => {
    const cash = (await accounts.getAccountByCode("1-1001"))!;
    const sales = (await accounts.getAccountByCode("4-1001"))!;
    const today = new Date().toISOString().slice(0, 10);
    const range = { startDate: today, endDate: today };
    const before = await ledger.getGeneralLedger(sales.id, range);
    const posted = await journal.postJournalEntry({
      entryDate: today, sourceType: "MANUAL", sourceId: `REV-TEST-${Date.now()}`, postingType: "MANUAL",
      description: "Uji pembalikan",
      lines: [
        { accountId: cash.id, accountCodeSnapshot: cash.code, accountNameSnapshot: cash.name, debit: 12345, credit: 0 },
        { accountId: sales.id, accountCodeSnapshot: sales.code, accountNameSnapshot: sales.name, debit: 0, credit: 12345 }
      ]
    }, actor);
    const mid = await ledger.getGeneralLedger(sales.id, range);
    expect(mid.endingBalance - before.endingBalance).toBe(12345);
    await journal.reverseJournalEntry(posted.id, actor, "uji");
    const after = await ledger.getGeneralLedger(sales.id, range);
    expect(after.endingBalance).toBe(before.endingBalance);
  });
});
