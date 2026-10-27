import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { getAccountById, listAccounts } from "@/lib/accounting/accountStore";
import { jakartaDateKey } from "@/lib/date/jakarta";

export type LedgerEntry = {
  id: string;
  journalEntryId: string;
  journalNumber: string;
  date: string;
  description: string;
  memo: string | null;
  tipeCodeSnapshot: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type GeneralLedgerResult = {
  account: {
    id: string;
    code: string;
    name: string;
    category: string;
    normalBalance: string;
    description: string | null;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  endingBalance: number;
  mutations: LedgerEntry[];
};

export async function getGeneralLedger(
  accountId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    tipeId?: string;
  } = {}
): Promise<GeneralLedgerResult> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error("Akun perkiraan tidak ditemukan.");

  const isDebitNormal = account.normalBalance === "DEBIT";

  // Tanggal default: bulan berjalan
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

  // 1. Hitung Saldo Awal (Mutasi sebelum startDate pada jurnal berstatus POSTED)
  const priorJournalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: { lt: startDate }
  };
  if (filters.tipeId) {
    priorJournalWhere.tipeId = filters.tipeId;
  }

  const priorWhere: Prisma.JournalLineWhereInput = {
    accountId,
    journalEntry: priorJournalWhere
  };

  const priorLines = await prisma.journalLine.findMany({
    where: priorWhere,
    select: { debit: true, credit: true }
  });

  let openingBalance = 0;
  for (const l of priorLines) {
    const d = Number(l.debit);
    const c = Number(l.credit);
    openingBalance += isDebitNormal ? d - c : c - d;
  }

  // 2. Ambil Mutasi Dalam Periode
  const periodJournalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: {
      gte: startDate,
      lte: endDate
    }
  };
  if (filters.tipeId) {
    periodJournalWhere.tipeId = filters.tipeId;
  }

  const periodWhere: Prisma.JournalLineWhereInput = {
    accountId,
    journalEntry: periodJournalWhere
  };

  const periodLines = await prisma.journalLine.findMany({
    where: periodWhere,
    include: {
      journalEntry: {
        select: {
          journalNumber: true,
          entryDate: true,
          description: true,
          tipeCodeSnapshot: true
        }
      }
    },
    orderBy: [
      { journalEntry: { entryDate: "asc" } },
      { journalEntry: { createdAt: "asc" } },
      { sortOrder: "asc" }
    ]
  });

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const mutations: LedgerEntry[] = [];
  for (const l of periodLines) {
    const d = Number(l.debit);
    const c = Number(l.credit);
    totalDebit += d;
    totalCredit += c;

    runningBalance += isDebitNormal ? d - c : c - d;

    mutations.push({
      id: l.id,
      journalEntryId: l.journalEntryId,
      journalNumber: l.journalEntry.journalNumber,
      date: jakartaDateKey(l.journalEntry.entryDate),
      description: l.journalEntry.description,
      memo: l.memo,
      tipeCodeSnapshot: l.journalEntry.tipeCodeSnapshot,
      debit: d,
      credit: c,
      runningBalance
    });
  }

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      category: account.category,
      normalBalance: account.normalBalance,
      description: account.description
    },
    period: {
      startDate: startDateStr,
      endDate: endDateStr
    },
    openingBalance,
    totalDebit,
    totalCredit,
    endingBalance: runningBalance,
    mutations
  };
}

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  category: string;
  normalBalance: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  endingDebit: number;
  endingCredit: number;
};

export type TrialBalanceResult = {
  period: {
    startDate: string;
    endDate: string;
  };
  accounts: TrialBalanceRow[];
  totals: {
    periodDebit: number;
    periodCredit: number;
    endingDebit: number;
    endingCredit: number;
  };
  isEquilibrium: boolean;
};

export async function getTrialBalance(
  filters: {
    startDate?: string;
    endDate?: string;
    tipeId?: string;
  } = {}
): Promise<TrialBalanceResult> {
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

  // Ambil seluruh journal line berstatus POSTED
  const priorJournalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: { lt: startDate },
    ...(filters.tipeId ? { tipeId: filters.tipeId } : {})
  };

  const periodJournalWhere: Prisma.JournalEntryWhereInput = {
    status: "POSTED",
    entryDate: { gte: startDate, lte: endDate },
    ...(filters.tipeId ? { tipeId: filters.tipeId } : {})
  };

  const [priorLines, periodLines] = await Promise.all([
    prisma.journalLine.findMany({
      where: {
        journalEntry: priorJournalWhere
      },
      select: { accountId: true, debit: true, credit: true }
    }),
    prisma.journalLine.findMany({
      where: {
        journalEntry: periodJournalWhere
      },
      select: { accountId: true, debit: true, credit: true }
    })
  ]);

  // Akumulasikan prior per akun
  const priorMap = new Map<string, { debit: number; credit: number }>();
  for (const l of priorLines) {
    const prev = priorMap.get(l.accountId) || { debit: 0, credit: 0 };
    prev.debit += Number(l.debit);
    prev.credit += Number(l.credit);
    priorMap.set(l.accountId, prev);
  }

  // Akumulasikan period per akun
  const periodMap = new Map<string, { debit: number; credit: number }>();
  for (const l of periodLines) {
    const prev = periodMap.get(l.accountId) || { debit: 0, credit: 0 };
    prev.debit += Number(l.debit);
    prev.credit += Number(l.credit);
    periodMap.set(l.accountId, prev);
  }

  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalEndingDebit = 0;
  let totalEndingCredit = 0;

  const rows: TrialBalanceRow[] = [];

  for (const acc of allAccounts) {
    const isDebitNormal = acc.normalBalance === "DEBIT";
    const prior = priorMap.get(acc.id) || { debit: 0, credit: 0 };
    const period = periodMap.get(acc.id) || { debit: 0, credit: 0 };

    const openingBalance = isDebitNormal
      ? prior.debit - prior.credit
      : prior.credit - prior.debit;

    const pDebit = period.debit;
    const pCredit = period.credit;

    totalPeriodDebit += pDebit;
    totalPeriodCredit += pCredit;

    // Hitung saldo bersih kumulatif hingga akhir periode
    const netCumulative = isDebitNormal
      ? openingBalance + (pDebit - pCredit)
      : openingBalance + (pCredit - pDebit);

    let endingDebit = 0;
    let endingCredit = 0;

    if (isDebitNormal) {
      if (netCumulative >= 0) {
        endingDebit = netCumulative;
      } else {
        endingCredit = Math.abs(netCumulative);
      }
    } else {
      if (netCumulative >= 0) {
        endingCredit = netCumulative;
      } else {
        endingDebit = Math.abs(netCumulative);
      }
    }

    totalEndingDebit += endingDebit;
    totalEndingCredit += endingCredit;

    // Masukkan baris jika akun memiliki aktivitas atau saldo
    rows.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      category: acc.category,
      normalBalance: acc.normalBalance,
      openingBalance,
      periodDebit: pDebit,
      periodCredit: pCredit,
      endingDebit,
      endingCredit
    });
  }

  const isEquilibrium =
    Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.01 &&
    Math.abs(totalEndingDebit - totalEndingCredit) < 0.01;

  return {
    period: {
      startDate: startDateStr,
      endDate: endDateStr
    },
    accounts: rows,
    totals: {
      periodDebit: totalPeriodDebit,
      periodCredit: totalPeriodCredit,
      endingDebit: totalEndingDebit,
      endingCredit: totalEndingCredit
    },
    isEquilibrium
  };
}
