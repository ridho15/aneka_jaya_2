import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LoanType, LoanStatus, Prisma } from "@prisma/client";
import type { LoanRepaymentInput, AdvanceSettlementInput } from "@/lib/validation/sdmSchema";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { postRepaymentJournal, postSettlementJournal } from "@/lib/accounting/postingHooks";

export type LoanLedgerEntry = {
  id: string;
  date: string;
  type: "DISBURSEMENT" | "REPAYMENT" | "SETTLEMENT";
  referenceNumber: string;
  description: string;
  debit: number;   // Pencairan menambah piutang
  credit: number;  // Pelunasan mengurangi piutang
  runningBalance: number;
  paymentMethod?: string;
  rekeningName?: string;
  attachmentUrl?: string | null;
  notes?: string | null;
  sourceExpenseId?: string;
};

export type EmployeeLoanOverviewRow = {
  employeeId: string;
  name: string;
  employeeName?: string;
  nik?: string | null;
  position: string;
  department: string;
  isActive: boolean;
  totalLoans: number;
  totalDisbursed?: number;
  totalRepaid: number;
  totalPaid?: number;
  openBalance: number;
  loanCount: number;
  hasActiveLoans: boolean;
  activeLoanCount?: number;
  lastActivityDate: Date | null;
  earliestDueDate?: string | null;
};

export async function listEmployeeLoanOverview(loanType: LoanType = "KASBON"): Promise<EmployeeLoanOverviewRow[]> {
  const employees = await prisma.employee.findMany({
    include: {
      loans: {
        where: {
          loanType,
          status: { in: ["ACTIVE", "PAID", "SETTLED"] }
        },
        include: {
          expenseRecord: {
            select: { approvalStatus: true }
          }
        },
        orderBy: { disbursedDate: "desc" }
      }
    },
    orderBy: [{ isActive: "desc" }, { department: "asc" }, { name: "asc" }]
  });

  return employees.map((emp) => {
    // Hanya pinjaman dengan status approved yang masuk ke saldo resmi
    const approvedLoans = emp.loans.filter((l) => l.expenseRecord?.approvalStatus === "approved");
    const totalDisbursed = approvedLoans.reduce((sum, loan) => sum + Number(loan.amount), 0);
    const totalPaid = approvedLoans.reduce((sum, loan) => sum + Number(loan.paidAmount), 0);
    const openBalance = approvedLoans.filter((l) => l.status === "ACTIVE").reduce((sum, loan) => sum + Number(loan.remainingAmount), 0);
    const activeLoanCount = approvedLoans.filter((l) => l.status === "ACTIVE").length;
    const earliestDueDate = approvedLoans
      .filter((l) => l.status === "ACTIVE" && l.dueDate)
      .map((l) => l.dueDate!)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      employeeId: emp.id,
      name: emp.name,
      employeeName: emp.name,
      nik: emp.nik,
      position: emp.position,
      department: emp.department,
      isActive: emp.isActive,
      totalLoans: totalDisbursed,
      totalDisbursed,
      totalRepaid: totalPaid,
      totalPaid,
      openBalance,
      loanCount: approvedLoans.length,
      hasActiveLoans: activeLoanCount > 0,
      activeLoanCount,
      lastActivityDate: approvedLoans[0]?.disbursedDate ?? null,
      earliestDueDate: earliestDueDate ? jakartaDateKey(earliestDueDate) : null
    };
  });
}

export async function listEmployeeLoans(filters: {
  employeeId?: string;
  loanType?: LoanType;
  status?: LoanStatus;
  keyword?: string;
} = {}) {
  const where: Prisma.EmployeeLoanWhereInput = {};
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.loanType) where.loanType = filters.loanType;
  if (filters.status) where.status = filters.status;
  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { employee: { name: { contains: q, mode: "insensitive" } } },
      { purpose: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } }
    ];
  }

  return prisma.employeeLoan.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, department: true, position: true } },
      expenseRecord: { select: { id: true, expenseDate: true, tipeCodeSnapshot: true, rekeningNameSnapshot: true, attachmentUrl: true, approvalStatus: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      settlement: true
    },
    orderBy: [{ disbursedDate: "desc" }, { createdAt: "desc" }]
  });
}

export type EmployeeLoanRow = Awaited<ReturnType<typeof listEmployeeLoans>>[number];

export async function getEmployeeLoan(id: string) {
  return prisma.employeeLoan.findUnique({
    where: { id },
    include: {
      employee: true,
      expenseRecord: true,
      payments: { orderBy: { paymentDate: "asc" } },
      settlement: true
    }
  });
}

export async function getEmployeeLedger(employeeId: string, loanType: LoanType = "KASBON"): Promise<{
  employee: { id: string; name: string; position: string; department: string };
  totalDisbursed: number;
  totalPaid: number;
  openBalance: number;
  entries: LoanLedgerEntry[];
}> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error("Karyawan tidak ditemukan.");

  const loans = await prisma.employeeLoan.findMany({
    where: { employeeId, loanType },
    include: {
      expenseRecord: { select: { id: true, expenseDate: true, rekeningNameSnapshot: true, attachmentUrl: true, approvalStatus: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      settlement: true
    },
    orderBy: { disbursedDate: "asc" }
  });

  type RawItem = {
    date: Date;
    createdAt: Date;
    entry: Omit<LoanLedgerEntry, "runningBalance">;
  };

  const rawItems: RawItem[] = [];

  for (const loan of loans) {
    const isApproved = loan.expenseRecord?.approvalStatus === "approved";
    const isPending = loan.expenseRecord?.approvalStatus === "pending_approval";
    const isRejected = loan.expenseRecord?.approvalStatus === "rejected" || loan.expenseRecord?.approvalStatus === "cancelled";

    // 1. Mutasi Pencairan (Debit hanya jika approved)
    rawItems.push({
      date: loan.disbursedDate,
      createdAt: loan.createdAt,
      entry: {
        id: `loan-${loan.id}`,
        date: jakartaDateKey(loan.disbursedDate),
        type: "DISBURSEMENT",
        referenceNumber: loan.expenseRecordId,
        description: isPending ? `[PENDING APPROVAL] Pencairan: ${loan.purpose}` : isRejected ? `[DITOLAK] Pencairan: ${loan.purpose}` : `Pencairan: ${loan.purpose}`,
        debit: isApproved ? Number(loan.amount) : 0,
        credit: 0,
        rekeningName: loan.expenseRecord?.rekeningNameSnapshot,
        attachmentUrl: loan.expenseRecord?.attachmentUrl,
        notes: isPending ? "Menunggu persetujuan (tidak menambah saldo resmi)" : loan.notes,
        sourceExpenseId: loan.expenseRecordId
      }
    });

    // 2. Mutasi Pelunasan / Cicilan (Kredit)
    for (const payment of loan.payments) {
      rawItems.push({
        date: payment.paymentDate,
        createdAt: payment.createdAt,
        entry: {
          id: `pay-${payment.id}`,
          date: jakartaDateKey(payment.paymentDate),
          type: "REPAYMENT",
          referenceNumber: `PAY-${payment.id.slice(0, 8)}`,
          description: `Pelunasan (${payment.paymentMethod}): ${payment.notes || payment.payrollReference || "Cicilan kasbon"}`,
          debit: 0,
          credit: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
          rekeningName: payment.rekeningNameSnapshot || undefined,
          attachmentUrl: payment.attachmentUrl,
          notes: payment.notes || payment.payrollReference,
          sourceExpenseId: loan.expenseRecordId
        }
      });
    }

    // 3. Mutasi Pertanggungjawaban Uang Muka (jika ada)
    if (loan.settlement) {
      const set = loan.settlement;
      rawItems.push({
        date: set.settlementDate,
        createdAt: set.createdAt,
        entry: {
          id: `set-${set.id}`,
          date: jakartaDateKey(set.settlementDate),
          type: "SETTLEMENT",
          referenceNumber: `SET-${set.id.slice(0, 8)}`,
          description: `Pertanggungjawaban uang muka (Biaya riil: Rp ${Number(set.actualExpenseAmount).toLocaleString("id-ID")}, Sisa kembali: Rp ${Number(set.refundAmount).toLocaleString("id-ID")})`,
          debit: 0,
          credit: Number(set.actualExpenseAmount) + Number(set.refundAmount),
          rekeningName: set.refundRekeningSnapshot || undefined,
          attachmentUrl: set.attachmentUrl,
          notes: set.notes,
          sourceExpenseId: loan.expenseRecordId
        }
      });
    }
  }

  // Urutkan secara kronologis (tanggal lalu waktu dibuat)
  rawItems.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());

  // Hitung running balance secara berurutan
  let balance = 0;
  const entries: LoanLedgerEntry[] = [];
  for (const item of rawItems) {
    balance += item.entry.debit - item.entry.credit;
    entries.push({
      ...item.entry,
      runningBalance: balance
    });
  }

  const approvedLoans = loans.filter((l) => l.expenseRecord?.approvalStatus === "approved");
  const totalDisbursed = approvedLoans.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalPaid = approvedLoans.reduce((sum, l) => sum + Number(l.paidAmount), 0);
  const openBalance = approvedLoans.filter((l) => l.status === "ACTIVE").reduce((sum, l) => sum + Number(l.remainingAmount), 0);

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      department: employee.department
    },
    totalDisbursed,
    totalPaid,
    openBalance,
    entries
  };
}

export async function recordLoanRepayment(input: LoanRepaymentInput, actor: { id: string; name: string; role: Role }) {
  const result = await prisma.$transaction(async (tx) => {
    const loan = await tx.employeeLoan.findUnique({
      where: { id: input.loanId },
      include: { employee: true }
    });
    if (!loan) throw new Error("Data kasbon/pinjaman tidak ditemukan.");
    if (loan.status !== "ACTIVE") throw new Error("Pinjaman ini sudah tidak berstatus aktif atau sudah lunas.");

    const remainingNum = Number(loan.remainingAmount);
    if (input.amount > remainingNum) {
      throw new Error(`Jumlah pelunasan (Rp ${input.amount.toLocaleString("id-ID")}) melebihi sisa pinjaman (Rp ${remainingNum.toLocaleString("id-ID")}).`);
    }

    const newPaidAmount = Number(loan.paidAmount) + input.amount;
    const newRemainingAmount = remainingNum - input.amount;
    const newStatus: LoanStatus = newRemainingAmount <= 0 ? "PAID" : "ACTIVE";

    const payment = await tx.employeeLoanPayment.create({
      data: {
        loanId: loan.id,
        employeeId: loan.employeeId,
        paymentDate: new Date(input.paymentDate),
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        rekeningId: input.rekeningId || null,
        rekeningNameSnapshot: input.rekeningNameSnapshot || null,
        payrollReference: input.payrollReference || null,
        notes: input.notes || null,
        attachmentUrl: input.attachmentUrl || null,
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name
      }
    });

    const updatedLoan = await tx.employeeLoan.update({
      where: { id: loan.id },
      data: {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        status: newStatus
      }
    });

    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "employee_loan_payment",
        entityId: payment.id,
        action: "create",
        afterValue: JSON.parse(JSON.stringify(payment)),
        userId: actor.id,
        userNameSnapshot: actor.name,
        userRoleSnapshot: actor.role,
        reason: `Pelunasan kasbon ${loan.employee.name} sebesar Rp ${input.amount.toLocaleString("id-ID")} via ${input.paymentMethod}. Sisa: Rp ${newRemainingAmount.toLocaleString("id-ID")}`
      }
    });

    return { payment, loan: updatedLoan };
  });

  await postRepaymentJournal(result.payment.id, actor).catch((err) => {
    console.error("[Auto-Journal Repayment Error]", err);
  });

  return result;
}

export async function recordAdvanceSettlement(input: AdvanceSettlementInput, actor: { id: string; name: string; role: Role }) {
  const result = await prisma.$transaction(async (tx) => {
    const loan = await tx.employeeLoan.findUnique({
      where: { id: input.loanId },
      include: { employee: true }
    });
    if (!loan) throw new Error("Data uang muka operasional tidak ditemukan.");
    if (loan.loanType !== "UANG_MUKA") throw new Error("Hanya uang muka operasional yang memerlukan tindakan pertanggungjawaban.");
    if (loan.status !== "ACTIVE") throw new Error("Uang muka ini sudah diselesaikan.");

    const originalLoanAmount = Number(loan.amount);
    if (input.actualExpenseAmount < originalLoanAmount) {
      const expectedRefund = originalLoanAmount - input.actualExpenseAmount;
      if (Math.abs(input.refundAmount - expectedRefund) > 0.01) {
        throw new Error(
          `Karena realisasi biaya (Rp ${input.actualExpenseAmount.toLocaleString("id-ID")}) lebih kecil dari uang muka (Rp ${originalLoanAmount.toLocaleString("id-ID")}), maka sisa kas yang dikembalikan harus tepat Rp ${expectedRefund.toLocaleString("id-ID")}.`
        );
      }
      if (!input.refundRekeningId) {
        throw new Error("Rekening penampung pengembalian sisa uang muka wajib dipilih.");
      }
    } else if (input.refundAmount > 0) {
      throw new Error("Tidak ada pengembalian kas jika realisasi pengeluaran sama dengan atau melebihi uang muka.");
    }

    const settlement = await tx.operationalAdvanceSettlement.create({
      data: {
        loanId: loan.id,
        settlementDate: new Date(input.settlementDate),
        actualExpenseAmount: input.actualExpenseAmount,
        refundAmount: input.refundAmount,
        refundRekeningId: input.refundRekeningId || null,
        refundRekeningSnapshot: input.refundRekeningSnapshot || null,
        notes: input.notes || null,
        attachmentUrl: input.attachmentUrl || null,
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name
      }
    });

    const updatedLoan = await tx.employeeLoan.update({
      where: { id: loan.id },
      data: {
        paidAmount: originalLoanAmount,
        remainingAmount: 0,
        status: "SETTLED"
      }
    });

    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "advance_settlement",
        entityId: settlement.id,
        action: "create",
        afterValue: JSON.parse(JSON.stringify(settlement)),
        userId: actor.id,
        userNameSnapshot: actor.name,
        userRoleSnapshot: actor.role,
        reason:
          input.actualExpenseAmount > originalLoanAmount
            ? `Pertanggungjawaban uang muka ${loan.employee.name}: Biaya Rp ${input.actualExpenseAmount.toLocaleString("id-ID")}, Kelebihan biaya karyawan: Rp ${(input.actualExpenseAmount - originalLoanAmount).toLocaleString("id-ID")}`
            : `Pertanggungjawaban uang muka ${loan.employee.name}: Biaya Rp ${input.actualExpenseAmount.toLocaleString("id-ID")}, Pengembalian kas: Rp ${input.refundAmount.toLocaleString("id-ID")}`
      }
    });

    return { settlement, loan: updatedLoan };
  });

  await postSettlementJournal(result.settlement.id, actor).catch((err) => {
    console.error("[Auto-Journal Settlement Error]", err);
  });

  return result;
}
