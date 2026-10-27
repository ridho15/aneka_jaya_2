import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import { getGeneralLedger } from "@/lib/accounting/ledgerStore";
import type { Role } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";

export interface ReconciliationItem {
  id: string;
  name: string;
  accountCode: string;
  accountName: string;
  subledgerSource: string;
  subledgerBalance: number;
  generalLedgerBalance: number;
  difference: number;
  isReconciled: boolean;
  notes: string;
}

export interface LegacyExpenseAuditItem {
  id: string;
  expenseDate: string;
  category: string;
  vendorName: string;
  description: string;
  amount: number;
  approvalStatus: string;
  postingStatus: string;
  suggestedCategoryCode: "employee_loan" | "salary" | "operational_advance";
  suggestedAccountCode: string;
  suggestedAccountName: string;
  reason: string;
}

export interface AccountingReconciliationReport {
  generatedAt: string;
  isOverallReconciled: boolean;
  totalSubledgerDiscrepancies: number;
  items: ReconciliationItem[];
  expensePostingStatus: {
    totalApprovedExpenses: number;
    totalApprovedAmount: number;
    postedExpensesCount: number;
    postedExpensesAmount: number;
    unpostedExpensesCount: number;
    unpostedExpensesAmount: number;
  };
  legacyAuditItems: LegacyExpenseAuditItem[];
}

export async function getAccountingReconciliationReport(): Promise<AccountingReconciliationReport> {
  await ensureStandardAccounts();

  // 1. Kasbon: Subledger (employeeLoan KASBON) vs GL (1-1003 Piutang Karyawan)
  let subledgerKasbon = 0;
  if (typeof prisma?.employeeLoan?.findMany === "function") {
    const activeKasbons = await prisma.employeeLoan.findMany({
      where: {
        loanType: "KASBON",
        status: "ACTIVE"
      },
      select: { remainingAmount: true }
    });
    subledgerKasbon = activeKasbons.reduce((sum, k) => sum + Number(k.remainingAmount || 0), 0);
  }

  const piutangKaryawanAccount = await getAccountByCode("1-1003");
  let glKasbon = 0;
  if (piutangKaryawanAccount) {
    const ledger = await getGeneralLedger(piutangKaryawanAccount.id);
    glKasbon = Number(ledger.endingBalance) || 0;
  }
  const diffKasbon = subledgerKasbon - glKasbon;

  // 2. Uang Muka: Subledger (employeeLoan UANG_MUKA) vs GL (1-1002 Uang Muka Operasional)
  let subledgerAdvance = 0;
  if (typeof prisma?.employeeLoan?.findMany === "function") {
    const activeAdvances = await prisma.employeeLoan.findMany({
      where: {
        loanType: "UANG_MUKA",
        status: "ACTIVE"
      },
      select: { remainingAmount: true }
    });
    subledgerAdvance = activeAdvances.reduce((sum, a) => sum + Number(a.remainingAmount || 0), 0);
  }

  const uangMukaAccount = await getAccountByCode("1-1002");
  let glAdvance = 0;
  if (uangMukaAccount) {
    const ledger = await getGeneralLedger(uangMukaAccount.id);
    glAdvance = Number(ledger.endingBalance) || 0;
  }
  const diffAdvance = subledgerAdvance - glAdvance;

  // 3. Simpanan Karyawan: Subledger (employeeSavings) vs GL (2-1003 Utang Simpanan Karyawan)
  let subledgerSavings = 0;
  if (typeof (prisma as any)?.employeeSavings?.findMany === "function") {
    const activeSavings = await (prisma as any).employeeSavings.findMany({
      where: { isActive: true },
      select: { balance: true }
    });
    subledgerSavings = activeSavings.reduce((sum: number, s: any) => sum + Number(s.balance || 0), 0);
  }

  const simpananAccount = await getAccountByCode("2-1003");
  let glSavings = 0;
  if (simpananAccount) {
    const ledger = await getGeneralLedger(simpananAccount.id);
    glSavings = Number(ledger.endingBalance) || 0;
  }
  const diffSavings = subledgerSavings - glSavings;

  // 4. Utang Usaha Pembelian: Subledger (purchaseInvoice) vs GL (2-1001 Utang Usaha)
  let subledgerPurchasingPayable = 0;
  if (typeof prisma?.purchaseInvoice?.findMany === "function") {
    const openInvoices = await prisma.purchaseInvoice.findMany({
      where: { status: { in: ["POSTED", "PARTIAL_PAID"] } },
      select: { totalAmountOriginal: true, totalPaidOriginal: true, exchangeRate: true }
    });
    subledgerPurchasingPayable = openInvoices.reduce((sum, inv) => {
      const remainingOriginal = Math.max(0, Number(inv.totalAmountOriginal) - Number(inv.totalPaidOriginal));
      return sum + Math.round(remainingOriginal * Number(inv.exchangeRate || 1));
    }, 0);
  }

  const utangUsahaAccount = await getAccountByCode("2-1001");
  let glPurchasingPayable = 0;
  if (utangUsahaAccount) {
    const ledger = await getGeneralLedger(utangUsahaAccount.id);
    glPurchasingPayable = Number(ledger.endingBalance) || 0;
  }
  const diffPurchasing = subledgerPurchasingPayable - glPurchasingPayable;

  // 5. Piutang Usaha Penjualan: Subledger (tempoReceivable) vs GL (1-1004 Piutang Usaha)
  let subledgerSalesReceivable = 0;
  if (typeof prisma?.tempoReceivable?.findMany === "function") {
    const openTempos = await prisma.tempoReceivable.findMany({
      where: { status: { in: ["open", "partial_paid", "overdue"] } },
      select: { remainingAmount: true }
    });
    subledgerSalesReceivable = openTempos.reduce((sum, t) => sum + Number(t.remainingAmount || 0), 0);
  }

  const piutangUsahaAccount = await getAccountByCode("1-1004");
  let glSalesReceivable = 0;
  if (piutangUsahaAccount) {
    const ledger = await getGeneralLedger(piutangUsahaAccount.id);
    glSalesReceivable = Number(ledger.endingBalance) || 0;
  }
  const diffSales = subledgerSalesReceivable - glSalesReceivable;

  const items: ReconciliationItem[] = [
    {
      id: "kasbon",
      name: "Kasbon Pribadi Karyawan",
      accountCode: "1-1003",
      accountName: "Piutang Karyawan",
      subledgerSource: "SDM Kasbon (Saldo Terbuka Karyawan)",
      subledgerBalance: subledgerKasbon,
      generalLedgerBalance: glKasbon,
      difference: diffKasbon,
      isReconciled: Math.abs(diffKasbon) < 1,
      notes: "Saldo kasbon per karyawan harus selalu seimbang dengan Buku Besar Akun 1-1003."
    },
    {
      id: "advance",
      name: "Uang Muka Operasional",
      accountCode: "1-1002",
      accountName: "Uang Muka Operasional",
      subledgerSource: "SDM Uang Muka (Belum Selesai Pertanggungjawaban)",
      subledgerBalance: subledgerAdvance,
      generalLedgerBalance: glAdvance,
      difference: diffAdvance,
      isReconciled: Math.abs(diffAdvance) < 1,
      notes: "Total dana uang muka yang masih dipegang staf sebelum laporan nota pertanggungjawaban."
    },
    {
      id: "savings",
      name: "Simpanan Sukarela Karyawan",
      accountCode: "2-1003",
      accountName: "Utang Simpanan Karyawan",
      subledgerSource: "SDM Simpanan (Total Saldo Akun Simpanan)",
      subledgerBalance: subledgerSavings,
      generalLedgerBalance: glSavings,
      difference: diffSavings,
      isReconciled: Math.abs(diffSavings) < 1,
      notes: "Kewajiban titipan dana simpanan yang wajib dicocokkan dengan saldo rekening bank penampung."
    },
    {
      id: "purchasing_payable",
      name: "Utang Pembelian Supplier",
      accountCode: "2-1001",
      accountName: "Utang Usaha",
      subledgerSource: "Faktur Pembelian Terbuka (POSTED / PARTIAL_PAID)",
      subledgerBalance: subledgerPurchasingPayable,
      generalLedgerBalance: glPurchasingPayable,
      difference: diffPurchasing,
      isReconciled: Math.abs(diffPurchasing) < 1,
      notes: "Sisa kewajiban pembayaran valas / IDR atas faktur supplier yang belum lunas."
    },
    {
      id: "sales_receivable",
      name: "Piutang Penjualan Tempo",
      accountCode: "1-1004",
      accountName: "Piutang Usaha",
      subledgerSource: "Tagihan Tempo Terbuka (UNPAID / PARTIAL)",
      subledgerBalance: subledgerSalesReceivable,
      generalLedgerBalance: glSalesReceivable,
      difference: diffSales,
      isReconciled: Math.abs(diffSales) < 1,
      notes: "Sisa tagihan penjualan tempo ke pelanggan yang belum diterima pelunasannya."
    }
  ];

  // 6. Expense Posting Status
  let totalApprovedExpenses = 0;
  let totalApprovedAmount = 0;
  let postedExpensesCount = 0;
  let postedExpensesAmount = 0;
  let unpostedExpensesCount = 0;
  let unpostedExpensesAmount = 0;

  if (typeof prisma?.expenseRecord?.findMany === "function") {
    const approvedExpenses = await prisma.expenseRecord.findMany({
      where: { approvalStatus: "approved" },
      select: { amount: true, postingStatus: true }
    });

    totalApprovedExpenses = approvedExpenses.length;
    for (const exp of approvedExpenses) {
      const amt = Number(exp.amount) || 0;
      totalApprovedAmount += amt;
      if (exp.postingStatus === "posted") {
        postedExpensesCount += 1;
        postedExpensesAmount += amt;
      } else {
        unpostedExpensesCount += 1;
        unpostedExpensesAmount += amt;
      }
    }
  }

  // 7. Legacy Expenses Audit Review Items
  // Sesuai Section F:
  // "Pengeluaran historis dengan teks seperti Kasbon Aida atau Gaji masuk daftar review manual;
  //  jangan otomatis mengubah laba rugi masa lalu."
  const legacyAuditItems: LegacyExpenseAuditItem[] = [];
  if (typeof prisma?.expenseRecord?.findMany === "function") {
    const candidates = await prisma.expenseRecord.findMany({
      where: {
        categoryCode: "operational_expense",
        OR: [
          { description: { contains: "kasbon", mode: "insensitive" } },
          { description: { contains: "pinjaman", mode: "insensitive" } },
          { description: { contains: "gaji", mode: "insensitive" } },
          { description: { contains: "salary", mode: "insensitive" } },
          { description: { contains: "uang muka", mode: "insensitive" } },
          { description: { contains: "advance", mode: "insensitive" } },
          { category: { contains: "kasbon", mode: "insensitive" } },
          { category: { contains: "gaji", mode: "insensitive" } },
          { category: { contains: "advance", mode: "insensitive" } }
        ]
      },
      orderBy: { expenseDate: "desc" },
      take: 50
    });

    for (const item of candidates) {
      const text = `${item.description} ${item.category}`.toLowerCase();
      let suggestedCategoryCode: "employee_loan" | "salary" | "operational_advance" = "employee_loan";
      let suggestedAccountCode = "1-1003";
      let suggestedAccountName = "Piutang Karyawan";
      let reason = "Terdeteksi teks kasbon/pinjaman pribadi dalam deskripsi beban operasional lama.";

      if (text.includes("gaji") || text.includes("salary")) {
        suggestedCategoryCode = "salary";
        suggestedAccountCode = "6-1002";
        suggestedAccountName = "Beban Gaji Karyawan";
        reason = "Terdeteksi pembayaran gaji dalam deskripsi pengeluaran lama.";
      } else if (text.includes("uang muka") || text.includes("advance")) {
        suggestedCategoryCode = "operational_advance";
        suggestedAccountCode = "1-1002";
        suggestedAccountName = "Uang Muka Operasional";
        reason = "Terdeteksi uang muka perjalanan/lapangan dalam deskripsi pengeluaran lama.";
      }

      legacyAuditItems.push({
        id: item.id,
        expenseDate: item.expenseDate.toISOString().split("T")[0],
        category: item.category,
        vendorName: item.vendorName,
        description: item.description,
        amount: Number(item.amount),
        approvalStatus: item.approvalStatus,
        postingStatus: item.postingStatus,
        suggestedCategoryCode,
        suggestedAccountCode,
        suggestedAccountName,
        reason
      });
    }
  }

  const totalDiscrepancies = items.filter((i) => !i.isReconciled).length;

  return {
    generatedAt: new Date().toISOString(),
    isOverallReconciled: totalDiscrepancies === 0 && unpostedExpensesCount === 0,
    totalSubledgerDiscrepancies: totalDiscrepancies,
    items,
    expensePostingStatus: {
      totalApprovedExpenses,
      totalApprovedAmount,
      postedExpensesCount,
      postedExpensesAmount,
      unpostedExpensesCount,
      unpostedExpensesAmount
    },
    legacyAuditItems
  };
}

export async function reclassifyLegacyExpense(
  expenseId: string,
  newCategoryCode: "employee_loan" | "salary" | "operational_advance",
  employeeId: string,
  actor: { id: string; name: string; role: Role }
) {
  const expense = await prisma.expenseRecord.findUnique({
    where: { id: expenseId }
  });
  if (!expense) throw new Error("Data pengeluaran tidak ditemukan.");

  let coaId = "1-1003";
  let coaNameSnapshot = "1-1003 Piutang Karyawan";
  let categoryLabel = "Kasbon pribadi";

  if (newCategoryCode === "salary") {
    coaId = "6-1002";
    coaNameSnapshot = "6-1002 Beban Gaji Karyawan";
    categoryLabel = "Gaji";
  } else if (newCategoryCode === "operational_advance") {
    coaId = "1-1002";
    coaNameSnapshot = "1-1002 Uang Muka Operasional";
    categoryLabel = "Uang muka operasional";
  }

  const updated = await prisma.expenseRecord.update({
    where: { id: expenseId },
    data: {
      categoryCode: newCategoryCode,
      category: categoryLabel,
      employeeId: employeeId || expense.employeeId,
      coaId,
      coaNameSnapshot
    }
  });

  await recordAudit({
    entityId: expenseId,
    entityType: "expense",
    action: "update",
    beforeValue: { categoryCode: expense.categoryCode },
    afterValue: { categoryCode: newCategoryCode, employeeId },
    reason: `Reklasifikasi biaya operasional lama: ${expense.categoryCode} -> ${newCategoryCode} oleh ${actor.name}`
  });

  return updated;
}
