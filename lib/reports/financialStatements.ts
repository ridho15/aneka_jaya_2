import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { listAccounts } from "@/lib/accounting/accountStore";
import { jakartaDateKey } from "@/lib/date/jakarta";

export type StatementAccountLine = {
  id: string;
  code: string;
  name: string;
  category: string;
  normalBalance: string;
  debit: number;
  credit: number;
  amount: number; // Signed / net amount appropriate for the section
};

export type IncomeStatementResult = {
  period: {
    startDate: string;
    endDate: string;
  };
  revenue: {
    lines: StatementAccountLine[];
    grossSales: number;
    forexGains: number;
    salesDeductions: number; // Returns & discounts (e.g. 4-1003)
    netRevenue: number;
  };
  cogs: {
    lines: StatementAccountLine[];
    totalCogs: number;
  };
  grossProfit: number;
  grossProfitMargin: number; // Percentage
  operatingExpenses: {
    lines: StatementAccountLine[];
    salaryExpense: number;
    generalExpense: number;
    logisticsExpense: number;
    utilitiesExpense: number;
    maintenanceExpense: number;
    forexLossExpense: number;
    otherExpenses: number;
    totalOperatingExpenses: number;
  };
  netOperatingIncome: number;
  netProfitMargin: number; // Percentage
};

export type BalanceSheetSection = {
  currentAssets: StatementAccountLine[];
  fixedAssets: StatementAccountLine[];
  otherAssets: StatementAccountLine[];
  totalCurrentAssets: number;
  totalFixedAssets: number;
  totalOtherAssets: number;
  totalAssets: number;
};

export type BalanceSheetLiabilities = {
  currentLiabilities: StatementAccountLine[];
  longTermLiabilities: StatementAccountLine[];
  totalCurrentLiabilities: number;
  totalLongTermLiabilities: number;
  totalLiabilities: number;
};

export type BalanceSheetEquity = {
  lines: StatementAccountLine[];
  paidInCapital: number;
  retainedEarnings: number;
  currentEarnings: number; // Laba periode berjalan dari pendapatan - beban
  totalEquity: number;
};

export type BalanceSheetResult = {
  asOfDate: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetLiabilities;
  equity: BalanceSheetEquity;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference: number;
};

export async function getIncomeStatement(filters: {
  startDate?: string;
  endDate?: string;
  tipeId?: string;
} = {}): Promise<IncomeStatementResult> {
  const allAccounts = await listAccounts({ isActive: true });

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const defaultStart = `${year}-${month}-01`;
  const defaultEnd = jakartaDateKey(today);

  const startDateStr = filters.startDate || defaultStart;
  const endDateStr = filters.endDate || defaultEnd;

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999);

  const journalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: { gte: startDate, lte: endDate },
    ...(filters.tipeId ? { tipeId: filters.tipeId } : {})
  };

  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: journalWhere
    },
    select: {
      accountId: true,
      debit: true,
      credit: true
    }
  });

  const accountTotals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const prev = accountTotals.get(l.accountId) || { debit: 0, credit: 0 };
    prev.debit += Number(l.debit);
    prev.credit += Number(l.credit);
    accountTotals.set(l.accountId, prev);
  }

  // Collections for sections
  const revenueLines: StatementAccountLine[] = [];
  const cogsLines: StatementAccountLine[] = [];
  const opexLines: StatementAccountLine[] = [];

  let grossSales = 0;
  let forexGains = 0;
  let salesDeductions = 0;
  let totalCogs = 0;

  let salaryExpense = 0;
  let generalExpense = 0;
  let logisticsExpense = 0;
  let utilitiesExpense = 0;
  let maintenanceExpense = 0;
  let forexLossExpense = 0;
  let otherExpenses = 0;

  for (const acc of allAccounts) {
    const totals = accountTotals.get(acc.id) || { debit: 0, credit: 0 };
    const debit = totals.debit;
    const credit = totals.credit;

    // Skip accounts with zero mutations in this period
    if (debit === 0 && credit === 0) continue;

    if (acc.category === "REVENUE") {
      if (acc.code === "4-1003") {
        // Kontra pendapatan: retur & potongan (normal debit)
        const netDeduction = debit - credit;
        salesDeductions += netDeduction;
        revenueLines.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          category: acc.category,
          normalBalance: acc.normalBalance,
          debit,
          credit,
          amount: -Math.abs(netDeduction)
        });
      } else {
        const netRev = credit - debit;
        if (acc.code === "4-1002") {
          forexGains += netRev;
        } else {
          grossSales += netRev;
        }
        revenueLines.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          category: acc.category,
          normalBalance: acc.normalBalance,
          debit,
          credit,
          amount: netRev
        });
      }
    } else if (acc.category === "EXPENSE") {
      const netExp = debit - credit;
      if (acc.code === "5-1001" || acc.code.startsWith("5-")) {
        // HPP / COGS
        totalCogs += netExp;
        cogsLines.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          category: acc.category,
          normalBalance: acc.normalBalance,
          debit,
          credit,
          amount: netExp
        });
      } else {
        // Beban Operasional
        if (acc.code === "6-1002") salaryExpense += netExp;
        else if (acc.code === "6-1001") generalExpense += netExp;
        else if (acc.code === "6-1003") logisticsExpense += netExp;
        else if (acc.code === "6-1004") maintenanceExpense += netExp;
        else if (acc.code === "6-1005") utilitiesExpense += netExp;
        else if (acc.code === "6-1006") forexLossExpense += netExp;
        else otherExpenses += netExp;

        opexLines.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          category: acc.category,
          normalBalance: acc.normalBalance,
          debit,
          credit,
          amount: netExp
        });
      }
    }
  }

  const netRevenue = (grossSales + forexGains) - salesDeductions;
  const grossProfit = netRevenue - totalCogs;
  const grossProfitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const totalOperatingExpenses =
    salaryExpense +
    generalExpense +
    logisticsExpense +
    utilitiesExpense +
    maintenanceExpense +
    forexLossExpense +
    otherExpenses;

  const netOperatingIncome = grossProfit - totalOperatingExpenses;
  const netProfitMargin = netRevenue > 0 ? (netOperatingIncome / netRevenue) * 100 : 0;

  return {
    period: {
      startDate: startDateStr,
      endDate: endDateStr
    },
    revenue: {
      lines: revenueLines,
      grossSales,
      forexGains,
      salesDeductions,
      netRevenue
    },
    cogs: {
      lines: cogsLines,
      totalCogs
    },
    grossProfit,
    grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
    operatingExpenses: {
      lines: opexLines,
      salaryExpense,
      generalExpense,
      logisticsExpense,
      utilitiesExpense,
      maintenanceExpense,
      forexLossExpense,
      otherExpenses,
      totalOperatingExpenses
    },
    netOperatingIncome,
    netProfitMargin: Math.round(netProfitMargin * 100) / 100
  };
}

export async function getBalanceSheet(filters: {
  asOfDate?: string;
  tipeId?: string;
} = {}): Promise<BalanceSheetResult> {
  const allAccounts = await listAccounts({ isActive: true });

  const today = new Date();
  const defaultAsOf = jakartaDateKey(today);
  const asOfDateStr = filters.asOfDate || defaultAsOf;

  const asOfDate = new Date(asOfDateStr);
  asOfDate.setHours(23, 59, 59, 999);

  // Ambil seluruh jurnal berstatus POSTED hingga asOfDate
  const journalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: { lte: asOfDate },
    ...(filters.tipeId ? { tipeId: filters.tipeId } : {})
  };

  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: journalWhere
    },
    select: {
      accountId: true,
      debit: true,
      credit: true
    }
  });

  const cumulativeTotals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const prev = cumulativeTotals.get(l.accountId) || { debit: 0, credit: 0 };
    prev.debit += Number(l.debit);
    prev.credit += Number(l.credit);
    cumulativeTotals.set(l.accountId, prev);
  }

  // 1. ASSETS
  const currentAssets: StatementAccountLine[] = [];
  const fixedAssets: StatementAccountLine[] = [];
  const otherAssets: StatementAccountLine[] = [];

  let totalCurrentAssets = 0;
  let totalFixedAssets = 0;
  let totalOtherAssets = 0;

  // 2. LIABILITIES
  const currentLiabilities: StatementAccountLine[] = [];
  const longTermLiabilities: StatementAccountLine[] = [];

  let totalCurrentLiabilities = 0;
  let totalLongTermLiabilities = 0;

  // 3. EQUITY
  const equityLines: StatementAccountLine[] = [];
  let paidInCapital = 0;
  let retainedEarnings = 0;

  // 4. INCOME / EXPENSE TRACKING FOR CURRENT EARNINGS
  let cumulativeRevenue = 0;
  let cumulativeExpenses = 0;

  for (const acc of allAccounts) {
    const totals = cumulativeTotals.get(acc.id) || { debit: 0, credit: 0 };
    const debit = totals.debit;
    const credit = totals.credit;

    // Track all-time cumulative revenues and expenses
    if (acc.category === "REVENUE") {
      if (acc.code === "4-1003") {
        // Kontra pendapatan: retur
        cumulativeRevenue -= (debit - credit);
      } else {
        cumulativeRevenue += (credit - debit);
      }
      continue;
    }

    if (acc.category === "EXPENSE") {
      cumulativeExpenses += (debit - credit);
      continue;
    }

    // Skip balance sheet accounts with zero cumulative balance
    if (debit === 0 && credit === 0) continue;

    if (acc.category === "ASSET") {
      const isDebitNormal = acc.normalBalance === "DEBIT";
      const amount = isDebitNormal ? debit - credit : -(credit - debit);

      const line: StatementAccountLine = {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        debit,
        credit,
        amount
      };

      if (acc.code.startsWith("1-1") || acc.code === "1-1006") {
        currentAssets.push(line);
        totalCurrentAssets += amount;
      } else if (acc.code.startsWith("1-2")) {
        fixedAssets.push(line);
        totalFixedAssets += amount;
      } else {
        otherAssets.push(line);
        totalOtherAssets += amount;
      }
    } else if (acc.category === "LIABILITY") {
      const amount = credit - debit;
      const line: StatementAccountLine = {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        debit,
        credit,
        amount
      };

      if (acc.code.startsWith("2-2")) {
        longTermLiabilities.push(line);
        totalLongTermLiabilities += amount;
      } else {
        currentLiabilities.push(line);
        totalCurrentLiabilities += amount;
      }
    } else if (acc.category === "EQUITY") {
      const amount = credit - debit;
      const line: StatementAccountLine = {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        debit,
        credit,
        amount
      };

      if (acc.code === "3-1001") {
        paidInCapital += amount;
      } else if (acc.code === "3-1002") {
        retainedEarnings += amount;
      }

      equityLines.push(line);
    }
  }

  const totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets;
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

  // Laba periode berjalan = Pendapatan kumulatif - Beban kumulatif
  const currentEarnings = cumulativeRevenue - cumulativeExpenses;
  const totalEquity = paidInCapital + retainedEarnings + currentEarnings;

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const diff = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = diff < 0.01;

  return {
    asOfDate: asOfDateStr,
    assets: {
      currentAssets,
      fixedAssets,
      otherAssets,
      totalCurrentAssets,
      totalFixedAssets,
      totalOtherAssets,
      totalAssets
    },
    liabilities: {
      currentLiabilities,
      longTermLiabilities,
      totalCurrentLiabilities,
      totalLongTermLiabilities,
      totalLiabilities
    },
    equity: {
      lines: equityLines,
      paidInCapital,
      retainedEarnings,
      currentEarnings,
      totalEquity
    },
    totalLiabilitiesAndEquity,
    isBalanced,
    difference: Math.round(diff * 100) / 100
  };
}
