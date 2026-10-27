import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, listAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import {
  postJournalEntry,
  createManualJournalEntry,
  reverseJournalEntry,
  getJournalEntry,
  listJournalEntries,
} from "@/lib/accounting/journalStore";
import { getGeneralLedger, getTrialBalance } from "@/lib/accounting/ledgerStore";
import {
  closeAccountingPeriod,
  reopenAccountingPeriod,
  assertPeriodOpen,
} from "@/lib/accounting/periodStore";
import { postExpenseJournal } from "@/lib/accounting/postingHooks";

describe("Fase 2: Akuntansi, Jurnal Umum, COA, dan Buku Besar", { timeout: 30000 }, () => {
  const actor = {
    id: "test-user-finance",
    name: "Finance Tester",
    role: "FINANCE" as const,
  };

  beforeAll(async () => {
    await ensureStandardAccounts();
  });

  describe("1. Standard COA Seed & Lookup", () => {
    it("memastikan seluruh akun standar UKM tersedia dalam sistem", async () => {
      const kasBank = await getAccountByCode("1-1001");
      const uangMuka = await getAccountByCode("1-1002");
      const piutangKaryawan = await getAccountByCode("1-1003");
      const utangGaji = await getAccountByCode("2-1002");
      const bebanOperasional = await getAccountByCode("6-1001");
      const bebanGaji = await getAccountByCode("6-1002");

      expect(kasBank).toBeDefined();
      expect(kasBank?.normalBalance).toBe("DEBIT");
      expect(kasBank?.category).toBe("ASSET");

      expect(uangMuka).toBeDefined();
      expect(piutangKaryawan).toBeDefined();
      expect(utangGaji?.normalBalance).toBe("CREDIT");
      expect(bebanOperasional?.normalBalance).toBe("DEBIT");
      expect(bebanGaji?.normalBalance).toBe("DEBIT");
    });
  });

  describe("2. Jurnal Berpasangan (Double-Entry Balance)", () => {
    it("menolak jurnal manual jika total debit dan kredit tidak seimbang", async () => {
      const kas = await getAccountByCode("1-1001");
      const beban = await getAccountByCode("6-1001");

      await expect(
        createManualJournalEntry(
          {
            entryDate: "2026-10-15",
            description: "Test Jurnal Tidak Seimbang",
            lines: [
              { accountId: beban!.id, debit: 150000, credit: 0 },
              { accountId: kas!.id, debit: 0, credit: 100000 }, // Selisih 50rb!
            ],
          },
          actor
        )
      ).rejects.toThrow();
    });

    it("berhasil membukukan jurnal berpasangan yang seimbang (Debit == Kredit)", async () => {
      const kas = await getAccountByCode("1-1001");
      const beban = await getAccountByCode("6-1001");

      const journal = await createManualJournalEntry(
        {
          entryDate: "2026-10-16",
          description: "Pembelian Alat Tulis Kantor",
          lines: [
            { accountId: beban!.id, debit: 75000, credit: 0, memo: "Kertas & Pulpen" },
            { accountId: kas!.id, debit: 0, credit: 75000, memo: "Kas Kecil" },
          ],
        },
        actor
      );

      expect(journal).toBeDefined();
      expect(journal.journalNumber).toMatch(/^JRN-202610-/);
      expect(Number(journal.totalDebit)).toBe(75000);
      expect(Number(journal.totalCredit)).toBe(75000);
      expect(journal.status).toBe("POSTED");
      expect(journal.lines).toHaveLength(2);
    });
  });

  describe("3. Period Closing Control (Period Lock)", () => {
    const lockPeriodKey = "2025-05";

    it("dapat mengunci periode akuntansi dan menolak jurnal baru pada periode terkunci", async () => {
      // Tutup periode Mei 2025
      await closeAccountingPeriod(lockPeriodKey, actor, "Penutupan audit tahun 2025");

      // Cek assertPeriodOpen
      await expect(assertPeriodOpen("2025-05-15")).rejects.toThrow(
        /Periode akuntansi 2025-05 telah ditutup/i
      );

      // Coba buat jurnal pada tanggal di periode terkunci
      const kas = await getAccountByCode("1-1001");
      const beban = await getAccountByCode("6-1001");

      await expect(
        createManualJournalEntry(
          {
            entryDate: "2025-05-10",
            description: "Transaksi Ilegal di Periode Terkunci",
            lines: [
              { accountId: beban!.id, debit: 50000, credit: 0 },
              { accountId: kas!.id, debit: 0, credit: 50000 },
            ],
          },
          actor
        )
      ).rejects.toThrow(/telah ditutup/i);

      // Buka kembali periode
      await reopenAccountingPeriod(lockPeriodKey, actor, "Koreksi audit");
      const checkAfter = await assertPeriodOpen("2025-05-15");
      expect(checkAfter).toBe(lockPeriodKey);
    });
  });

  describe("4. Pembalikan Jurnal (Reversal)", () => {
    it("menerbitkan jurnal pembalik yang meniadakan saldo debit dan kredit", async () => {
      const kas = await getAccountByCode("1-1001");
      const piutang = await getAccountByCode("1-1003");

      // Buat jurnal awal
      const original = await createManualJournalEntry(
        {
          entryDate: "2026-10-20",
          description: "Jurnal Kasbon Sementara",
          lines: [
            { accountId: piutang!.id, debit: 300000, credit: 0 },
            { accountId: kas!.id, debit: 0, credit: 300000 },
          ],
        },
        actor
      );

      // Balikkan jurnal
      const reversal = await reverseJournalEntry(
        original.id,
        actor,
        "Pembatalan kasbon karena salah input"
      );

      expect(reversal).toBeDefined();
      expect(reversal.isReversal).toBe(true);
      expect(reversal.reversalOfJournalId).toBe(original.id);
      expect(Number(reversal.totalDebit)).toBe(300000);
      expect(Number(reversal.totalCredit)).toBe(300000);

      // Periksa baris pembalik terbalik posisinya
      const revLines = reversal.lines;
      const reversedKasLine = revLines.find((l) => l.accountId === kas!.id);
      const reversedPiutangLine = revLines.find((l) => l.accountId === piutang!.id);

      // Asalnya kas kredit 300rb, sekarang harus debit 300rb
      expect(Number(reversedKasLine?.debit)).toBe(300000);
      expect(Number(reversedKasLine?.credit)).toBe(0);

      // Asalnya piutang debit 300rb, sekarang harus kredit 300rb
      expect(Number(reversedPiutangLine?.debit)).toBe(0);
      expect(Number(reversedPiutangLine?.credit)).toBe(300000);

      // Cek status original
      const updatedOriginal = await getJournalEntry(original.id);
      expect(updatedOriginal?.status).toBe("REVERSED");
      expect(updatedOriginal?.reversedByJournalId).toBe(reversal.id);
    });
  });

  describe("5. Buku Besar & Neraca Saldo Equilibrium", () => {
    it("menghitung saldo berjalan buku besar dan menjaga keseimbangan neraca saldo", async () => {
      const kas = await getAccountByCode("1-1001");

      const ledger = await getGeneralLedger(kas!.id, {
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });

      expect(ledger).toBeDefined();
      expect(ledger.account.code).toBe("1-1001");
      expect(typeof ledger.openingBalance).toBe("number");
      expect(typeof ledger.endingBalance).toBe("number");
      expect(typeof ledger.totalDebit).toBe("number");
      expect(typeof ledger.totalCredit).toBe("number");

      // Cek neraca saldo
      const trialBalance = await getTrialBalance({
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });

      expect(trialBalance).toBeDefined();
      expect(trialBalance.totals.endingDebit).toBeGreaterThanOrEqual(0);
      expect(trialBalance.totals.endingCredit).toBeGreaterThanOrEqual(0);
      expect(trialBalance.isEquilibrium).toBe(true);
    });
  });

  describe("6. Otomatis Posting Jurnal Pengeluaran (Expense Posting Hooks)", () => {
    it("memposting gaji langsung (EXPENSE) ke Debit 6-1002 Beban Gaji & Kredit 1-1001 Kas", async () => {
      const expId = `test-exp-sal-direct-${Date.now()}`;
      await prisma.expenseRecord.create({
        data: {
          id: expId,
          expenseDate: new Date("2026-10-25"),
          tipeId: "W",
          tipeCodeSnapshot: "W",
          tipeNameSnapshot: "Walk In",
          rekeningId: "rek-1",
          rekeningNameSnapshot: "Kas Toko",
          coaId: "6-1002",
          coaNameSnapshot: "Beban Gaji Karyawan",
          category: "Gaji",
          categoryCode: "salary",
          salaryPeriod: "2026-10",
          vendorName: "Budi Santoso",
          description: "Pembayaran gaji langsung Budi",
          amount: 5000000,
          paymentMethod: "Transfer",
          approvalStatus: "approved",
          createdByUserId: actor.id,
          createdByNameSnapshot: actor.name,
          createdByRoleSnapshot: actor.role,
          createdAt: new Date()
        }
      });

      const journal = await postExpenseJournal(expId, actor);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebit)).toBe(5000000);
      expect(Number(journal?.totalCredit)).toBe(5000000);

      const debitLine = journal?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journal?.lines.find((l) => Number(l.credit) > 0);

      expect(debitLine?.accountCodeSnapshot).toBe("6-1002");
      expect(creditLine?.accountCodeSnapshot).toBe("1-1001");
    });

    it("memposting pelunasan utang gaji (PAYABLE) ke Debit 2-1002 Utang Gaji & Kredit 1-1001 Kas", async () => {
      const expId = `test-exp-sal-pay-${Date.now()}`;
      await prisma.expenseRecord.create({
        data: {
          id: expId,
          expenseDate: new Date("2026-10-25"),
          tipeId: "W",
          tipeCodeSnapshot: "W",
          tipeNameSnapshot: "Walk In",
          rekeningId: "rek-1",
          rekeningNameSnapshot: "Kas Toko",
          coaId: "2-1002",
          coaNameSnapshot: "Utang Gaji",
          category: "Gaji",
          categoryCode: "salary",
          salaryPeriod: "2026-10",
          vendorName: "Siti Rahma",
          description: "Pelunasan utang gaji payroll Siti",
          amount: 4500000,
          paymentMethod: "Transfer",
          approvalStatus: "approved",
          createdByUserId: actor.id,
          createdByNameSnapshot: actor.name,
          createdByRoleSnapshot: actor.role,
          createdAt: new Date()
        }
      });

      const journal = await postExpenseJournal(expId, actor);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebit)).toBe(4500000);
      expect(Number(journal?.totalCredit)).toBe(4500000);

      const debitLine = journal?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journal?.lines.find((l) => Number(l.credit) > 0);

      expect(debitLine?.accountCodeSnapshot).toBe("2-1002");
      expect(creditLine?.accountCodeSnapshot).toBe("1-1001");
    });
  });
});
