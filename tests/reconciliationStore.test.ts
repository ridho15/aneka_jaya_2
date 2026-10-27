import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import {
  getAccountingReconciliationReport,
  reclassifyLegacyExpense
} from "@/lib/accounting/reconciliationStore";

describe("Fase 5: Rekonsiliasi Subledger vs GL & Review Pengeluaran Historis", { timeout: 30000 }, () => {
  const actor = {
    id: "user-finance-test",
    name: "Finance Auditor",
    role: "FINANCE" as const
  };

  beforeAll(async () => {
    await ensureStandardAccounts();
  });

  it("menghasilkan laporan rekonsiliasi dengan 5 matriks subledger lengkap", async () => {
    const report = await getAccountingReconciliationReport();

    expect(report).toBeDefined();
    expect(report.items).toHaveLength(5);

    const ids = report.items.map((i) => i.id);
    expect(ids).toContain("kasbon");
    expect(ids).toContain("advance");
    expect(ids).toContain("savings");
    expect(ids).toContain("purchasing_payable");
    expect(ids).toContain("sales_receivable");

    expect(typeof report.isOverallReconciled).toBe("boolean");
    expect(typeof report.expensePostingStatus.totalApprovedExpenses).toBe("number");
    expect(Array.isArray(report.legacyAuditItems)).toBe(true);
  });

  it("mendeteksi pengeluaran operasional lama yang bertuliskan kasbon dan memasukkannya ke antrean review manual", async () => {
    const legacyExpId = `test-legacy-kasbon-${Date.now()}`;
    await prisma.expenseRecord.create({
      data: {
        id: legacyExpId,
        expenseDate: new Date("2026-09-10"),
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Wahana",
        rekeningId: "rek-1",
        rekeningNameSnapshot: "Kas Toko",
        coaId: "Operasional",
        coaNameSnapshot: "Operasional",
        category: "Kasbon Aida",
        categoryCode: "operational_expense", // Lama tercatat sebagai beban operasional
        vendorName: "Aida Rahma",
        description: "Pinjaman kasbon Aida keperluan keluarga",
        amount: 500000,
        paymentMethod: "Tunai",
        approvalStatus: "approved",
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name,
        createdByRoleSnapshot: actor.role,
        createdAt: new Date()
      }
    });

    const report = await getAccountingReconciliationReport();
    const candidate = report.legacyAuditItems.find((c) => c.id === legacyExpId);

    expect(candidate).toBeDefined();
    expect(candidate?.suggestedCategoryCode).toBe("employee_loan");
    expect(candidate?.suggestedAccountCode).toBe("1-1003");

    // Lakukan reklasifikasi manual terkonfirmasi
    const updated = await reclassifyLegacyExpense(
      legacyExpId,
      "employee_loan",
      "",
      actor
    );

    expect(updated).toBeDefined();
    expect(updated.categoryCode).toBe("employee_loan");
    expect(updated.coaId).toBe("1-1003");

    // Pastikan sekarang keluar dari antrean review
    const reportAfter = await getAccountingReconciliationReport();
    const candidateAfter = reportAfter.legacyAuditItems.find((c) => c.id === legacyExpId);
    expect(candidateAfter).toBeUndefined();
  });
});
