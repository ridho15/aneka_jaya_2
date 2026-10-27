import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: {
    id: "user-owner-test",
    name: "Owner Test",
    role: "OWNER" as const
  }
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
  getCurrentRole: vi.fn(async () => mocks.user.role)
}));

import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import {
  getOrCreateSavingsAccount,
  depositSavings,
  withdrawSavings,
  listSavingsAccounts,
  getSavingsSummary
} from "@/lib/sdm/savingsStore";
import {
  assignSupervisor,
  getOrganizationHierarchy
} from "@/lib/sdm/hierarchyStore";
import {
  getIncomeStatement,
  getBalanceSheet
} from "@/lib/reports/financialStatements";

describe("Fase 5: Simpanan Karyawan, Struktur Organisasi, & Laporan Keuangan Final", { timeout: 45000 }, () => {
  const actor = {
    id: "user-owner-test",
    name: "Owner Test",
    role: "OWNER" as const
  };

  let testEmployeeId1: string;
  let testEmployeeId2: string;
  let testRekeningId: string;

  beforeAll(async () => {
    await ensureStandardAccounts();

    // 1. Create test rekening if not exists
    const existingRek = await prisma.rekeningAccount.findFirst({
      where: { name: "Rekening Operasional Fase 5 Test" }
    });
    if (existingRek) {
      testRekeningId = existingRek.id;
    } else {
      const cashAcc = await getAccountByCode("1-1001");
      const rek = await prisma.rekeningAccount.create({
        data: {
          id: `rek-fase5-${Date.now()}`,
          name: "Rekening Operasional Fase 5 Test",
          bankName: "BCA",
          accountNumber: "9988776655",
          accountId: cashAcc?.id || null,
          currency: "IDR",
          isActive: true
        }
      });
      testRekeningId = rek.id;
    }

    // 2. Create test employees
    const emp1 = await prisma.employee.create({
      data: {
        nik: `EMP-F5-A-${Date.now().toString().slice(-4)}`,
        name: "Budi Manager Fase 5",
        position: "Operasional Manager",
        department: "OPERASIONAL",
        isActive: true
      }
    });
    testEmployeeId1 = emp1.id;

    const emp2 = await prisma.employee.create({
      data: {
        nik: `EMP-F5-B-${Date.now().toString().slice(-4)}`,
        name: "Andi Staff Fase 5",
        position: "Staff Gudang",
        department: "GUDANG",
        isActive: true
      }
    });
    testEmployeeId2 = emp2.id;
  });

  describe("1. Simpanan Karyawan (Internal Savings & Double-Entry)", () => {
    it("dapat membuka rekening simpanan baru untuk karyawan dengan saldo awal Rp 0", async () => {
      const account = await getOrCreateSavingsAccount(testEmployeeId1);

      expect(account).toBeDefined();
      expect(account.employeeId).toBe(testEmployeeId1);
      expect(account.accountNumber).toMatch(/^SAV-/);
      expect(Number(account.balance)).toBe(0);
      expect(account.isActive).toBe(true);
    });

    it("dapat membukukan setoran simpanan (DEPOSIT) dan otomatis memposting jurnal Kas vs Utang Simpanan", async () => {
      const depositAmount = 1500000;
      const result = await depositSavings(
        {
          employeeId: testEmployeeId1,
          amount: depositAmount,
          transactionDate: new Date(),
          rekeningAccountId: testRekeningId,
          notes: "Setoran tabungan wajib pertama",
          source: "DIRECT_CASH"
        },
        actor
      );

      expect(result).toBeDefined();
      expect(Number(result.trx.amount)).toBe(depositAmount);
      expect(result.trx.type).toBe("DEPOSIT");
      expect(Number(result.updatedAccount.balance)).toBe(depositAmount);
      expect(result.trx.journalEntryId).toBeDefined();

      // Verifikasi Jurnal Double-Entry
      const journal = await prisma.journalEntry.findUnique({
        where: { id: result.trx.journalEntryId! },
        include: { lines: true }
      });

      expect(journal).toBeDefined();
      expect(journal!.status).toBe("POSTED");
      expect(Number(journal!.totalDebit)).toBe(depositAmount);
      expect(Number(journal!.totalCredit)).toBe(depositAmount);
      expect(Number(journal!.totalDebit)).toBe(Number(journal!.totalCredit));

      // Baris Debit: Kas & Bank (1-1001), Baris Kredit: Utang Simpanan (2-1003)
      const debitLine = journal!.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journal!.lines.find((l) => Number(l.credit) > 0);

      expect(debitLine?.accountCodeSnapshot).toBe("1-1001");
      expect(Number(debitLine?.debit)).toBe(depositAmount);

      expect(creditLine?.accountCodeSnapshot).toBe("2-1003");
      expect(Number(creditLine?.credit)).toBe(depositAmount);
    });

    it("menolak penarikan simpanan yang melebihi saldo tersedia (overdraw prevention)", async () => {
      // Saldo saat ini 1.500.000, coba tarik 2.000.000
      await expect(
        withdrawSavings(
          {
            employeeId: testEmployeeId1,
            amount: 2000000,
            transactionDate: new Date(),
            rekeningAccountId: testRekeningId,
            notes: "Coba tarik melebihi saldo"
          },
          actor
        )
      ).rejects.toThrow(/Saldo simpanan tidak mencukupi/i);
    });

    it("dapat mencairkan simpanan (WITHDRAWAL) dan otomatis memposting jurnal Utang Simpanan vs Kas", async () => {
      const withdrawAmount = 500000;
      const result = await withdrawSavings(
        {
          employeeId: testEmployeeId1,
          amount: withdrawAmount,
          transactionDate: new Date(),
          rekeningAccountId: testRekeningId,
          notes: "Pencairan tabungan darurat"
        },
        actor
      );

      expect(result).toBeDefined();
      expect(Number(result.trx.amount)).toBe(withdrawAmount);
      expect(result.trx.type).toBe("WITHDRAWAL");
      // Saldo awal 1.500.000 - 500.000 = 1.000.000
      expect(Number(result.updatedAccount.balance)).toBe(1000000);

      // Verifikasi Jurnal Double-Entry
      const journal = await prisma.journalEntry.findUnique({
        where: { id: result.trx.journalEntryId! },
        include: { lines: true }
      });

      expect(journal).toBeDefined();
      expect(journal!.status).toBe("POSTED");
      expect(Number(journal!.totalDebit)).toBe(withdrawAmount);
      expect(Number(journal!.totalCredit)).toBe(withdrawAmount);

      // Baris Debit: Utang Simpanan (2-1003), Baris Kredit: Kas & Bank (1-1001)
      const debitLine = journal!.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journal!.lines.find((l) => Number(l.credit) > 0);

      expect(debitLine?.accountCodeSnapshot).toBe("2-1003");
      expect(Number(debitLine?.debit)).toBe(withdrawAmount);

      expect(creditLine?.accountCodeSnapshot).toBe("1-1001");
      expect(Number(creditLine?.credit)).toBe(withdrawAmount);
    });

    it("dapat menghasilkan ringkasan simpanan karyawan (summary metrics)", async () => {
      const summary = await getSavingsSummary();

      expect(summary.totalEmployeesWithSavings).toBeGreaterThanOrEqual(1);
      expect(summary.totalBalance).toBeGreaterThanOrEqual(1000000);
      expect(summary.totalDeposits).toBeGreaterThanOrEqual(1500000);
      expect(summary.totalWithdrawals).toBeGreaterThanOrEqual(500000);
    });
  });

  describe("2. Struktur Organisasi Dinamis (Hierarchy & Org Chart)", () => {
    it("dapat menetapkan atasan langsung untuk karyawan dan menghitung bawahan secara rekursif", async () => {
      // Set testEmployeeId1 (Budi Manager) sebagai atasan testEmployeeId2 (Andi Staff)
      const updated = await assignSupervisor(testEmployeeId2, testEmployeeId1, actor);

      expect(updated.managerId).toBe(testEmployeeId1);

      const hierarchy = await getOrganizationHierarchy();
      expect(hierarchy.totalEmployees).toBeGreaterThanOrEqual(2);

      // Cari node manager
      function findNode(nodes: any[], id: string): any {
        for (const n of nodes) {
          if (n.id === id) return n;
          const childFind = findNode(n.children, id);
          if (childFind) return childFind;
        }
        return null;
      }

      const managerNode = findNode(hierarchy.roots, testEmployeeId1);
      expect(managerNode).toBeDefined();
      expect(managerNode.subordinateCount).toBeGreaterThanOrEqual(1);
    });

    it("mencegah relasi atasan melingkar (siklik) antar karyawan", async () => {
      // testEmployeeId2 adalah bawahan testEmployeeId1
      // Mencoba menjadikan testEmployeeId2 sebagai atasan testEmployeeId1 harus ditolak
      await expect(
        assignSupervisor(testEmployeeId1, testEmployeeId2, actor)
      ).rejects.toThrow(/hierarki melingkar/i);
    });
  });

  describe("3. Laporan Laba Rugi Komprehensif (Income Statement / P&L)", () => {
    it("mengkalkulasi pendapatan, HPP, beban operasional, dan laba bersih secara konsisten", async () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-28`;

      const pnl = await getIncomeStatement({ startDate, endDate });

      expect(pnl).toBeDefined();
      expect(pnl.period.startDate).toBe(startDate);
      expect(pnl.period.endDate).toBe(endDate);

      // Verifikasi persamaan Laba Rugi:
      // Gross Revenue = grossSales + forexGains
      // Net Revenue = Gross Revenue - salesDeductions
      const expectedNetRevenue = (pnl.revenue.grossSales + pnl.revenue.forexGains) - pnl.revenue.salesDeductions;
      expect(pnl.revenue.netRevenue).toBe(expectedNetRevenue);

      // Gross Profit = Net Revenue - Total COGS
      const expectedGrossProfit = pnl.revenue.netRevenue - pnl.cogs.totalCogs;
      expect(pnl.grossProfit).toBe(expectedGrossProfit);

      // Net Operating Income = Gross Profit - Total Operating Expenses
      const expectedNetIncome = pnl.grossProfit - pnl.operatingExpenses.totalOperatingExpenses;
      expect(pnl.netOperatingIncome).toBe(expectedNetIncome);
    });
  });

  describe("4. Laporan Neraca & Pembuktian Equilibrium (Balance Sheet)", () => {
    it("menghitung posisi neraca dan membuktikan keseimbangan sempurna (Total Aset === Total Liabilitas + Total Ekuitas)", async () => {
      const balanceSheet = await getBalanceSheet();

      expect(balanceSheet).toBeDefined();
      expect(balanceSheet.assets).toBeDefined();
      expect(balanceSheet.liabilities).toBeDefined();
      expect(balanceSheet.equity).toBeDefined();

      // Total Aset = Current + Fixed + Other
      const expectedAssets =
        balanceSheet.assets.totalCurrentAssets +
        balanceSheet.assets.totalFixedAssets +
        balanceSheet.assets.totalOtherAssets;
      expect(balanceSheet.assets.totalAssets).toBe(expectedAssets);

      // Total Liabilitas = Current + LongTerm
      const expectedLiabilities =
        balanceSheet.liabilities.totalCurrentLiabilities +
        balanceSheet.liabilities.totalLongTermLiabilities;
      expect(balanceSheet.liabilities.totalLiabilities).toBe(expectedLiabilities);

      // Total Ekuitas = PaidIn + Retained + CurrentEarnings
      const expectedEquity =
        balanceSheet.equity.paidInCapital +
        balanceSheet.equity.retainedEarnings +
        balanceSheet.equity.currentEarnings;
      expect(balanceSheet.equity.totalEquity).toBe(expectedEquity);

      // Total Liabilitas & Ekuitas
      const expectedLiabilitiesAndEquity = expectedLiabilities + expectedEquity;
      expect(balanceSheet.totalLiabilitiesAndEquity).toBe(expectedLiabilitiesAndEquity);

      // EQUILIBRIUM PROOF:
      // Selisih antara Total Aset dan Total (Liabilitas + Ekuitas) harus < 0.01 (0 diff)
      expect(balanceSheet.isBalanced).toBe(true);
      expect(balanceSheet.difference).toBeLessThan(0.01);
    });
  });
});
