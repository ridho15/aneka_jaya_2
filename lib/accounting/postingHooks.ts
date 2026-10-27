import "server-only";
import { prisma } from "@/lib/db/prisma";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting/journalStore";
import { getAccountByCode, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import type { Role } from "@/lib/auth/roles";

/**
 * Otomatis mem-posting jurnal untuk Pengeluaran yang disetujui (Approved).
 * Aturan sesuai Section E build prompt:
 * - Beban Operasional: Debit Beban (6-1001) vs Kredit Kas & Bank (1-1001)
 * - Kasbon: Debit Piutang Karyawan (1-1003) vs Kredit Kas & Bank (1-1001)
 * - Uang Muka: Debit Uang Muka Operasional (1-1002) vs Kredit Kas & Bank (1-1001)
 * - Gaji: Debit Beban Gaji (6-1002) vs Kredit Kas & Bank (1-1001)
 */
export async function postExpenseJournal(
  expenseId: string,
  actor?: { id: string; name: string; role: Role }
) {
  await ensureStandardAccounts();

  const expense = await prisma.expenseRecord.findUnique({
    where: { id: expenseId },
    include: {
      employee: true
    }
  });

  if (!expense) throw new Error("Data pengeluaran tidak ditemukan.");
  if (expense.approvalStatus !== "approved") {
    // Hanya pengeluaran yang approved yang dijurnal resmi
    return null;
  }

  const effectiveActor = actor || {
    id: expense.createdByUserId,
    name: expense.createdByNameSnapshot,
    role: expense.createdByRoleSnapshot || ("FINANCE" as Role)
  };

  const amount = Number(expense.amount);
  if (amount <= 0) return null;

  // Resolve Kas/Bank account
  const cashAccount = await getAccountByCode("1-1001");
  if (!cashAccount) throw new Error("Akun perkiraan Kas & Bank (1-1001) tidak ditemukan.");

  let debitAccountCode = "6-1001";
  let description = expense.description || `Pengeluaran ${expense.tipeCodeSnapshot || ""}`;

  if (expense.categoryCode === "employee_loan") {
    debitAccountCode = "1-1003"; // Piutang Karyawan
    description = `Pencairan Kasbon: ${expense.employee?.name || expense.vendorName || "Karyawan"} - ${expense.purpose || expense.description || ""}`;
  } else if (expense.categoryCode === "operational_advance") {
    debitAccountCode = "1-1002"; // Uang Muka Operasional
    description = `Pencairan Uang Muka Operasional: ${expense.employee?.name || expense.vendorName || "Karyawan"} - ${expense.purpose || expense.description || ""}`;
  } else if (expense.categoryCode === "salary") {
    const isPayable =
      expense.coaId === "2-1002" ||
      expense.coaId?.includes("2-1002") ||
      (expense as any).salaryPaymentType === "PAYABLE";
    if (isPayable) {
      debitAccountCode = "2-1002"; // Pelunasan Utang Gaji
      description = `Pelunasan Utang Gaji: ${expense.employee?.name || expense.vendorName || "Karyawan"} Periode ${expense.salaryPeriod || ""}`;
    } else {
      debitAccountCode = "6-1002"; // Beban Gaji Karyawan Langsung
      description = `Pembayaran Gaji: ${expense.employee?.name || expense.vendorName || "Karyawan"} Periode ${expense.salaryPeriod || ""}`;
    }
  } else if (expense.coaId && /^[0-9]+-[0-9]+/.test(expense.coaId)) {
    // If user explicitly picked a COA code
    debitAccountCode = expense.coaId;
  }

  const debitAccount = await getAccountByCode(debitAccountCode);
  if (!debitAccount) throw new Error(`Akun perkiraan (${debitAccountCode}) tidak ditemukan.`);

  const journal = await postJournalEntry(
    {
      entryDate: expense.expenseDate,
      sourceType: "EXPENSE",
      sourceId: expense.id,
      postingType: "DISBURSEMENT",
      tipeId: expense.tipeId,
      tipeCodeSnapshot: expense.tipeCodeSnapshot,
      description: description.trim(),
      attachmentUrl: expense.attachmentUrl,
      lines: [
        {
          accountId: debitAccount.id,
          accountCodeSnapshot: debitAccount.code,
          accountNameSnapshot: debitAccount.name,
          debit: amount,
          credit: 0,
          memo: description
        },
        {
          accountId: cashAccount.id,
          accountCodeSnapshot: cashAccount.code,
          accountNameSnapshot: cashAccount.name,
          debit: 0,
          credit: amount,
          memo: `Rekening: ${expense.rekeningNameSnapshot || "Kas/Bank"}`
        }
      ]
    },
    effectiveActor
  );

  // Update expense record with posting status
  await prisma.expenseRecord.update({
    where: { id: expense.id },
    data: {
      postingStatus: "posted",
      journalEntryId: journal.id
    }
  });

  return journal;
}

/**
 * Reversal jurnal pengeluaran saat dibatalkan atau ditolak (Rejected)
 */
export async function reverseExpenseJournal(
  expenseId: string,
  reason: string,
  actor: { id: string; name: string; role: Role }
) {
  const expense = await prisma.expenseRecord.findUnique({
    where: { id: expenseId }
  });
  if (!expense || !expense.journalEntryId) return null;

  const reversal = await reverseJournalEntry(expense.journalEntryId, actor, reason);

  await prisma.expenseRecord.update({
    where: { id: expense.id },
    data: {
      postingStatus: "reversed"
    }
  });

  return reversal;
}

/**
 * Otomatis mem-posting jurnal untuk Pelunasan Kasbon (Repayment).
 * - Transfer / Cash: Debit Kas & Bank (1-1001) vs Kredit Piutang Karyawan (1-1003)
 * - Potong Gaji: Debit Utang Gaji (2-1002) vs Kredit Piutang Karyawan (1-1003)
 */
export async function postRepaymentJournal(
  paymentId: string,
  actor?: { id: string; name: string; role: Role }
) {
  if (typeof prisma?.employeeLoanPayment?.findUnique !== "function") return null;
  await ensureStandardAccounts();

  const payment = await prisma.employeeLoanPayment.findUnique({
    where: { id: paymentId },
    include: {
      employee: true,
      loan: {
        include: { expenseRecord: true }
      }
    }
  });

  if (!payment) throw new Error("Data pelunasan kasbon tidak ditemukan.");

  const effectiveActor = actor || {
    id: payment.createdByUserId,
    name: payment.createdByNameSnapshot,
    role: "FINANCE" as Role
  };

  const amount = Number(payment.amount);
  if (amount <= 0) return null;

  const piutangAccount = await getAccountByCode("1-1003");
  if (!piutangAccount) throw new Error("Akun perkiraan Piutang Karyawan (1-1003) tidak ditemukan.");

  let debitAccountCode = "1-1001"; // Kas & Bank default
  if (payment.paymentMethod === "POTONG_GAJI") {
    debitAccountCode = "2-1002"; // Utang Gaji
  }

  const debitAccount = await getAccountByCode(debitAccountCode);
  if (!debitAccount) throw new Error(`Akun perkiraan (${debitAccountCode}) tidak ditemukan.`);

  const desc = `Pelunasan Kasbon ${payment.employee.name} via ${payment.paymentMethod}${payment.payrollReference ? ` (${payment.payrollReference})` : ""}`;

  return postJournalEntry(
    {
      entryDate: payment.paymentDate,
      sourceType: "LOAN_REPAYMENT",
      sourceId: payment.id,
      postingType: "REPAYMENT",
      tipeId: payment.loan.expenseRecord?.tipeId || null,
      tipeCodeSnapshot: payment.loan.expenseRecord?.tipeCodeSnapshot || null,
      description: desc,
      attachmentUrl: payment.attachmentUrl,
      lines: [
        {
          accountId: debitAccount.id,
          accountCodeSnapshot: debitAccount.code,
          accountNameSnapshot: debitAccount.name,
          debit: amount,
          credit: 0,
          memo: payment.paymentMethod === "POTONG_GAJI" ? "Dipotong dari Utang Gaji karyawan" : `Penerimaan kas/bank: ${payment.rekeningNameSnapshot || ""}`
        },
        {
          accountId: piutangAccount.id,
          accountCodeSnapshot: piutangAccount.code,
          accountNameSnapshot: piutangAccount.name,
          debit: 0,
          credit: amount,
          memo: `Pelunasan piutang kasbon ${payment.employee.name}`
        }
      ]
    },
    effectiveActor
  );
}

/**
 * Otomatis mem-posting jurnal untuk Pertanggungjawaban Uang Muka (Settlement).
 * - Debit Beban Operasional Riil (6-1001) sebesar actualExpenseAmount
 * - Debit Kas & Bank (1-1001) sebesar refundAmount (jika ada pengembalian sisa kas)
 * - Kredit Uang Muka Operasional (1-1002) sebesar uang muka asal
 * - Jika riil > uang muka, kelebihan biaya menjadi utang reimburse ke karyawan (2-1001 Utang Usaha / Beban Terutang)
 */
export async function postSettlementJournal(
  settlementId: string,
  actor?: { id: string; name: string; role: Role }
) {
  if (typeof prisma?.operationalAdvanceSettlement?.findUnique !== "function") return null;
  await ensureStandardAccounts();

  const settlement = await prisma.operationalAdvanceSettlement.findUnique({
    where: { id: settlementId },
    include: {
      loan: {
        include: {
          employee: true,
          expenseRecord: true
        }
      }
    }
  });

  if (!settlement) throw new Error("Data pertanggungjawaban uang muka tidak ditemukan.");

  const effectiveActor = actor || {
    id: settlement.createdByUserId,
    name: settlement.createdByNameSnapshot,
    role: "FINANCE" as Role
  };

  const actualExpense = Number(settlement.actualExpenseAmount);
  const refundAmount = Number(settlement.refundAmount);
  const originalLoanAmount = Number(settlement.loan.amount);

  const uangMukaAccount = await getAccountByCode("1-1002");
  if (!uangMukaAccount) throw new Error("Akun perkiraan Uang Muka Operasional (1-1002) tidak ditemukan.");

  const expenseAccount = await getAccountByCode("6-1001");
  if (!expenseAccount) throw new Error("Akun perkiraan Beban Operasional Umum (6-1001) tidak ditemukan.");

  const cashAccount = await getAccountByCode("1-1001");
  if (!cashAccount) throw new Error("Akun perkiraan Kas & Bank (1-1001) tidak ditemukan.");

  const lines = [];

  // 1. Beban riil yang dilaporkan
  lines.push({
    accountId: expenseAccount.id,
    accountCodeSnapshot: expenseAccount.code,
    accountNameSnapshot: expenseAccount.name,
    debit: actualExpense,
    credit: 0,
    memo: `Realisasi biaya dinas nota riil: ${settlement.loan.employee.name}`
  });

  // 2. Jika ada sisa kas yang dikembalikan oleh karyawan
  if (refundAmount > 0) {
    lines.push({
      accountId: cashAccount.id,
      accountCodeSnapshot: cashAccount.code,
      accountNameSnapshot: cashAccount.name,
      debit: refundAmount,
      credit: 0,
      memo: `Setoran kembali sisa uang muka ke ${settlement.refundRekeningSnapshot || "Kas/Bank"}`
    });
  }

  // 3. Kredit Uang Muka Operasional sebesar nilai uang muka asal
  lines.push({
    accountId: uangMukaAccount.id,
    accountCodeSnapshot: uangMukaAccount.code,
    accountNameSnapshot: uangMukaAccount.name,
    debit: 0,
    credit: originalLoanAmount,
    memo: `Penyelesaian uang muka asal ${settlement.loan.employee.name}`
  });

  // 4. Jika biaya riil melebihi uang muka asal (perusahaan berutang reimburse ke karyawan)
  if (actualExpense > originalLoanAmount) {
    const deficit = actualExpense - originalLoanAmount;
    const utangReimburseAccount = (await getAccountByCode("2-1001")) || (await getAccountByCode("2-1002"));
    if (utangReimburseAccount) {
      lines.push({
        accountId: utangReimburseAccount.id,
        accountCodeSnapshot: utangReimburseAccount.code,
        accountNameSnapshot: utangReimburseAccount.name,
        debit: 0,
        credit: deficit,
        memo: `Kewajiban reimburse talangan karyawan ${settlement.loan.employee.name}`
      });
    }
  }

  const desc = `Pertanggungjawaban Uang Muka: ${settlement.loan.employee.name} (${settlement.notes || "Selesai"})`;

  return postJournalEntry(
    {
      entryDate: settlement.settlementDate,
      sourceType: "ADVANCE_SETTLEMENT",
      sourceId: settlement.id,
      postingType: "SETTLEMENT",
      tipeId: settlement.loan.expenseRecord?.tipeId || null,
      tipeCodeSnapshot: settlement.loan.expenseRecord?.tipeCodeSnapshot || null,
      description: desc,
      attachmentUrl: settlement.attachmentUrl,
      lines
    },
    effectiveActor
  );
}
