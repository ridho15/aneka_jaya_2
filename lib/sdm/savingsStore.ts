import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, SavingsTransactionType, SavingsTransactionSource } from "@prisma/client";
import { getAccountByCode } from "@/lib/accounting/accountStore";
import { postJournalEntry } from "@/lib/accounting/journalStore";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export type DepositSavingsInput = {
  employeeId: string;
  amount: number;
  transactionDate: Date | string;
  rekeningAccountId?: string | null;
  notes?: string | null;
  source?: SavingsTransactionSource;
};

export type WithdrawSavingsInput = {
  employeeId: string;
  amount: number;
  transactionDate: Date | string;
  rekeningAccountId?: string | null;
  notes?: string | null;
};

export async function generateSavingsAccountNumber(employeeId: string): Promise<string> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { nik: true, id: true }
  });

  const baseCode = emp?.nik?.trim()
    ? `SAV-${emp.nik.trim().toUpperCase()}`
    : `SAV-${employeeId.slice(-6).toUpperCase()}`;

  let candidate = baseCode;
  let counter = 1;
  while (true) {
    const existing = await prisma.employeeSavings.findUnique({
      where: { accountNumber: candidate }
    });
    if (!existing) return candidate;
    candidate = `${baseCode}-${counter}`;
    counter++;
  }
}

export async function getOrCreateSavingsAccount(employeeId: string, notes?: string) {
  const existing = await prisma.employeeSavings.findUnique({
    where: { employeeId },
    include: {
      employee: true,
      transactions: {
        orderBy: { transactionDate: "desc" },
        take: 10
      }
    }
  });

  if (existing) return existing;

  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new Error("Data karyawan tidak ditemukan.");

  const accountNumber = await generateSavingsAccountNumber(employeeId);

  return prisma.employeeSavings.create({
    data: {
      employeeId,
      accountNumber,
      balance: 0,
      isActive: true,
      notes: notes || `Akun Simpanan Karyawan: ${emp.name}`
    },
    include: {
      employee: true,
      transactions: true
    }
  });
}

export async function getSavingsAccountById(id: string) {
  return prisma.employeeSavings.findUnique({
    where: { id },
    include: {
      employee: true,
      transactions: {
        orderBy: { transactionDate: "desc" },
        include: {
          rekeningAccount: true,
          journalEntry: true
        }
      }
    }
  });
}

export async function getSavingsAccountByEmployeeId(employeeId: string) {
  return prisma.employeeSavings.findUnique({
    where: { employeeId },
    include: {
      employee: true,
      transactions: {
        orderBy: { transactionDate: "desc" },
        include: {
          rekeningAccount: true,
          journalEntry: true
        }
      }
    }
  });
}

export async function listSavingsAccounts(filters: {
  isActive?: boolean;
  keyword?: string;
} = {}) {
  const where: Prisma.EmployeeSavingsWhereInput = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { accountNumber: { contains: q, mode: "insensitive" } },
      { employee: { name: { contains: q, mode: "insensitive" } } },
      { employee: { nik: { contains: q, mode: "insensitive" } } },
      { employee: { department: { contains: q, mode: "insensitive" } } }
    ];
  }

  return prisma.employeeSavings.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          nik: true,
          name: true,
          department: true,
          position: true,
          isActive: true
        }
      },
      _count: {
        select: { transactions: true }
      }
    },
    orderBy: [
      { balance: "desc" },
      { employee: { name: "asc" } }
    ]
  });
}

export async function depositSavings(
  input: DepositSavingsInput,
  actor: { id: string; name: string; role: Role }
) {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (amount <= 0 || isNaN(amount)) {
    throw new Error("Nominal setoran simpanan harus lebih dari 0.");
  }

  const savingsAccount = await getOrCreateSavingsAccount(input.employeeId);
  const employee = savingsAccount.employee;
  const dateObj = typeof input.transactionDate === "string" ? new Date(input.transactionDate) : input.transactionDate;

  // Resolve COA accounts
  const savingsLiabilityAccount = await getAccountByCode("2-1003");
  if (!savingsLiabilityAccount) {
    throw new Error("Akun perkiraan Utang Simpanan Karyawan (2-1003) belum terdaftar di COA.");
  }

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) {
    throw new Error("Akun perkiraan Kas & Bank (1-1001) belum terdaftar di COA.");
  }

  let bankAccount = defaultCashAccount;
  let rekeningSnapshotName = defaultCashAccount.name;
  if (input.rekeningAccountId) {
    const rek = await prisma.rekeningAccount.findUnique({
      where: { id: input.rekeningAccountId },
      include: { account: true }
    });
    if (rek) {
      if (rek.account) bankAccount = rek.account;
      rekeningSnapshotName = rek.name;
    }
  }

  // Execute database transaction for savings balance & transaction log
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.employeeSavings.findUniqueOrThrow({
      where: { id: savingsAccount.id }
    });
    const currentBal = Number(current.balance);
    const newBal = currentBal + amount;

    const trx = await tx.employeeSavingsTransaction.create({
      data: {
        savingsAccountId: savingsAccount.id,
        transactionDate: dateObj,
        type: "DEPOSIT",
        source: input.source || "DIRECT_CASH",
        amount,
        balanceAfter: newBal,
        rekeningAccountId: input.rekeningAccountId || null,
        notes: input.notes || "Setoran simpanan karyawan",
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name
      }
    });

    const updatedAccount = await tx.employeeSavings.update({
      where: { id: savingsAccount.id },
      data: {
        balance: newBal,
        updatedAt: new Date()
      }
    });

    return { trx, updatedAccount };
  }, { maxWait: 15000, timeout: 30000 });

  // Post double-entry journal entry
  // Debit: Kas/Bank (1-1001), Kredit: Utang Simpanan Karyawan (2-1003)
  try {
    const journal = await postJournalEntry(
      {
        entryDate: dateObj,
        sourceType: "EMPLOYEE_SAVINGS",
        sourceId: result.trx.id,
        postingType: "DEPOSIT",
        description: `Setoran Simpanan: ${employee.name} (${savingsAccount.accountNumber})`,
        lines: [
          {
            accountId: bankAccount.id,
            accountCodeSnapshot: bankAccount.code,
            accountNameSnapshot: rekeningSnapshotName,
            debit: amount,
            credit: 0,
            memo: `Penerimaan setoran simpanan karyawan ${employee.name}`
          },
          {
            accountId: savingsLiabilityAccount.id,
            accountCodeSnapshot: savingsLiabilityAccount.code,
            accountNameSnapshot: savingsLiabilityAccount.name,
            debit: 0,
            credit: amount,
            memo: `Kewajiban tabungan karyawan ${employee.name}`
          }
        ]
      },
      actor
    );

    const updatedTrx = await prisma.employeeSavingsTransaction.update({
      where: { id: result.trx.id },
      data: { journalEntryId: journal.id }
    });
    result.trx = updatedTrx;
  } catch (err: any) {
    console.error("Gagal membukukan jurnal setoran simpanan:", err);
  }

  await recordAudit({
    entityType: "employee_savings",
    entityId: result.trx.id,
    action: "deposit",
    afterValue: {
      accountNumber: savingsAccount.accountNumber,
      employeeName: employee.name,
      amount,
      balanceAfter: result.updatedAccount.balance
    },
    reason: `Setoran simpanan karyawan ${employee.name} sebesar Rp ${amount.toLocaleString("id-ID")}`
  });

  return result;
}

export async function withdrawSavings(
  input: WithdrawSavingsInput,
  actor: { id: string; name: string; role: Role }
) {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (amount <= 0 || isNaN(amount)) {
    throw new Error("Nominal penarikan simpanan harus lebih dari 0.");
  }

  const savingsAccount = await prisma.employeeSavings.findUnique({
    where: { employeeId: input.employeeId },
    include: { employee: true }
  });

  if (!savingsAccount) {
    throw new Error("Rekening simpanan untuk karyawan ini belum terdaftar.");
  }
  if (!savingsAccount.isActive) {
    throw new Error("Rekening simpanan ini sedang tidak aktif.");
  }

  const currentBal = Number(savingsAccount.balance);
  if (amount > currentBal) {
    throw new Error(
      `Saldo simpanan tidak mencukupi untuk penarikan Rp ${amount.toLocaleString("id-ID")}. Saldo tersedia: Rp ${currentBal.toLocaleString("id-ID")}.`
    );
  }

  const employee = savingsAccount.employee;
  const dateObj = typeof input.transactionDate === "string" ? new Date(input.transactionDate) : input.transactionDate;

  // Resolve COA accounts
  const savingsLiabilityAccount = await getAccountByCode("2-1003");
  if (!savingsLiabilityAccount) {
    throw new Error("Akun perkiraan Utang Simpanan Karyawan (2-1003) belum terdaftar di COA.");
  }

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) {
    throw new Error("Akun perkiraan Kas & Bank (1-1001) belum terdaftar di COA.");
  }

  let bankAccount = defaultCashAccount;
  let rekeningSnapshotName = defaultCashAccount.name;
  if (input.rekeningAccountId) {
    const rek = await prisma.rekeningAccount.findUnique({
      where: { id: input.rekeningAccountId },
      include: { account: true }
    });
    if (rek) {
      if (rek.account) bankAccount = rek.account;
      rekeningSnapshotName = rek.name;
    }
  }

  // Execute database transaction for savings balance deduction & transaction log
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.employeeSavings.findUniqueOrThrow({
      where: { id: savingsAccount.id }
    });
    const bal = Number(current.balance);
    if (amount > bal) {
      throw new Error(`Saldo tidak mencukupi. Saldo saat ini: Rp ${bal.toLocaleString("id-ID")}`);
    }
    const newBal = bal - amount;

    const trx = await tx.employeeSavingsTransaction.create({
      data: {
        savingsAccountId: savingsAccount.id,
        transactionDate: dateObj,
        type: "WITHDRAWAL",
        source: "DIRECT_CASH",
        amount,
        balanceAfter: newBal,
        rekeningAccountId: input.rekeningAccountId || null,
        notes: input.notes || "Penarikan simpanan karyawan",
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name
      }
    });

    const updatedAccount = await tx.employeeSavings.update({
      where: { id: savingsAccount.id },
      data: {
        balance: newBal,
        updatedAt: new Date()
      }
    });

    return { trx, updatedAccount };
  }, { maxWait: 15000, timeout: 30000 });

  // Post double-entry journal entry
  // Debit: Utang Simpanan Karyawan (2-1003), Kredit: Kas/Bank (1-1001)
  try {
    const journal = await postJournalEntry(
      {
        entryDate: dateObj,
        sourceType: "EMPLOYEE_SAVINGS",
        sourceId: result.trx.id,
        postingType: "WITHDRAWAL",
        description: `Penarikan Simpanan: ${employee.name} (${savingsAccount.accountNumber})`,
        lines: [
          {
            accountId: savingsLiabilityAccount.id,
            accountCodeSnapshot: savingsLiabilityAccount.code,
            accountNameSnapshot: savingsLiabilityAccount.name,
            debit: amount,
            credit: 0,
            memo: `Pengurangan simpanan karyawan ${employee.name}`
          },
          {
            accountId: bankAccount.id,
            accountCodeSnapshot: bankAccount.code,
            accountNameSnapshot: rekeningSnapshotName,
            debit: 0,
            credit: amount,
            memo: `Pencairan dana tabungan ${employee.name}`
          }
        ]
      },
      actor
    );

    const updatedTrx = await prisma.employeeSavingsTransaction.update({
      where: { id: result.trx.id },
      data: { journalEntryId: journal.id }
    });
    result.trx = updatedTrx;
  } catch (err: any) {
    console.error("Gagal membukukan jurnal penarikan simpanan:", err);
  }

  await recordAudit({
    entityType: "employee_savings",
    entityId: result.trx.id,
    action: "withdrawal",
    afterValue: {
      accountNumber: savingsAccount.accountNumber,
      employeeName: employee.name,
      amount,
      balanceAfter: result.updatedAccount.balance
    },
    reason: `Penarikan simpanan karyawan ${employee.name} sebesar Rp ${amount.toLocaleString("id-ID")}`
  });

  return result;
}

export async function listSavingsTransactions(filters: {
  employeeId?: string;
  savingsAccountId?: string;
  type?: SavingsTransactionType;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
} = {}) {
  const where: Prisma.EmployeeSavingsTransactionWhereInput = {};
  if (filters.employeeId) {
    where.savingsAccount = { employeeId: filters.employeeId };
  }
  if (filters.savingsAccountId) {
    where.savingsAccountId = filters.savingsAccountId;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.startDate || filters.endDate) {
    where.transactionDate = {};
    if (filters.startDate) where.transactionDate.gte = new Date(filters.startDate);
    if (filters.endDate) where.transactionDate.lte = new Date(filters.endDate);
  }

  return prisma.employeeSavingsTransaction.findMany({
    where,
    include: {
      savingsAccount: {
        include: {
          employee: {
            select: { id: true, name: true, nik: true, department: true }
          }
        }
      },
      rekeningAccount: {
        select: { id: true, name: true, bankName: true, accountNumber: true }
      },
      journalEntry: {
        select: { id: true, journalNumber: true, status: true }
      }
    },
    orderBy: { transactionDate: "desc" },
    take: filters.limit || 100
  });
}

export async function getSavingsSummary() {
  const accounts = await prisma.employeeSavings.findMany({
    where: { isActive: true },
    select: { balance: true }
  });

  const totalEmployeesWithSavings = accounts.length;
  let totalBalance = 0;
  for (const acc of accounts) {
    totalBalance += Number(acc.balance) || 0;
  }

  const [depositAgg, withdrawalAgg] = await Promise.all([
    prisma.employeeSavingsTransaction.aggregate({
      where: { type: "DEPOSIT" },
      _sum: { amount: true },
      _count: true
    }),
    prisma.employeeSavingsTransaction.aggregate({
      where: { type: "WITHDRAWAL" },
      _sum: { amount: true },
      _count: true
    })
  ]);

  return {
    totalEmployeesWithSavings,
    totalBalance,
    totalDeposits: Number(depositAgg._sum.amount) || 0,
    depositCount: depositAgg._count,
    totalWithdrawals: Number(withdrawalAgg._sum.amount) || 0,
    withdrawalCount: withdrawalAgg._count
  };
}
