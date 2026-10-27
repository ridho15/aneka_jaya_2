import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const txMock: any = {};
  txMock.employeeLoan = {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn()
  };
  txMock.employeeLoanPayment = {
    create: vi.fn()
  };
  txMock.operationalAdvanceSettlement = {
    create: vi.fn()
  };
  txMock.auditLog = {
    create: vi.fn()
  };
  txMock.$transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txMock));

  return {
    prisma: txMock
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { recordLoanRepayment, recordAdvanceSettlement } from "@/lib/sdm/loanStore";
import type { Role } from "@/lib/auth/roles";

describe("SDM LoanStore - Repayment and Settlement Business Logic", () => {
  const actor = { id: "user-1", name: "Admin Finance", role: "FINANCE" as Role };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLoanRepayment", () => {
    it("rejects repayment when loan is not found", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue(null);

      await expect(
        recordLoanRepayment(
          {
            loanId: "nonexistent",
            paymentDate: "2026-10-25",
            amount: 500000,
            paymentMethod: "TRANSFER",
            rekeningId: "rek-1"
          },
          actor
        )
      ).rejects.toThrow("Data kasbon/pinjaman tidak ditemukan.");
    });

    it("rejects overpayment when payment amount exceeds remaining loan balance", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "loan-1",
        employeeId: "emp-1",
        status: "ACTIVE",
        amount: 1000000,
        paidAmount: 300000,
        remainingAmount: 700000,
        employee: { name: "Budi Santoso" }
      });

      // Attempting to pay Rp 800.000 when remaining is only Rp 700.000
      await expect(
        recordLoanRepayment(
          {
            loanId: "loan-1",
            paymentDate: "2026-10-25",
            amount: 800000,
            paymentMethod: "TRANSFER",
            rekeningId: "rek-1"
          },
          actor
        )
      ).rejects.toThrow(/melebihi sisa pinjaman/i);
    });

    it("successfully applies partial repayment of Rp 300.000 to Rp 1.000.000 loan, leaving Rp 700.000", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "loan-1",
        employeeId: "emp-1",
        status: "ACTIVE",
        amount: 1000000,
        paidAmount: 0,
        remainingAmount: 1000000,
        employee: { name: "Budi Santoso" }
      });

      mocks.prisma.employeeLoanPayment.create.mockResolvedValue({
        id: "pay-1",
        amount: 300000,
        paymentMethod: "TRANSFER"
      });

      mocks.prisma.employeeLoan.update.mockImplementation(async ({ data }: any) => ({
        id: "loan-1",
        ...data
      }));

      mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });

      const result = await recordLoanRepayment(
        {
          loanId: "loan-1",
          paymentDate: "2026-10-25",
          amount: 300000,
          paymentMethod: "TRANSFER",
          rekeningId: "rek-1"
        },
        actor
      );

      expect(mocks.prisma.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: "loan-1" },
        data: {
          paidAmount: 300000,
          remainingAmount: 700000,
          status: "ACTIVE"
        }
      });
      expect(result.loan.remainingAmount).toBe(700000);
      expect(result.loan.status).toBe("ACTIVE");
    });

    it("marks loan as PAID when remaining balance reaches 0 via potong gaji", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "loan-1",
        employeeId: "emp-1",
        status: "ACTIVE",
        amount: 1000000,
        paidAmount: 300000,
        remainingAmount: 700000,
        employee: { name: "Budi Santoso" }
      });

      mocks.prisma.employeeLoanPayment.create.mockResolvedValue({
        id: "pay-2",
        amount: 700000,
        paymentMethod: "POTONG_GAJI"
      });

      mocks.prisma.employeeLoan.update.mockImplementation(async ({ data }: any) => ({
        id: "loan-1",
        ...data
      }));

      mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit-2" });

      const result = await recordLoanRepayment(
        {
          loanId: "loan-1",
          paymentDate: "2026-10-25",
          amount: 700000,
          paymentMethod: "POTONG_GAJI",
          payrollReference: "Slip Gaji 2026-10"
        },
        actor
      );

      expect(mocks.prisma.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: "loan-1" },
        data: {
          paidAmount: 1000000,
          remainingAmount: 0,
          status: "PAID"
        }
      });
      expect(result.loan.remainingAmount).toBe(0);
      expect(result.loan.status).toBe("PAID");
    });
  });

  describe("recordAdvanceSettlement", () => {
    it("rejects settlement when actual expense + refund != advance loan amount", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "adv-1",
        employeeId: "emp-2",
        loanType: "UANG_MUKA",
        status: "ACTIVE",
        amount: 1500000,
        employee: { name: "Ahmad" }
      });

      // Total reported = 1.200.000 + 200.000 = 1.400.000 != 1.500.000
      await expect(
        recordAdvanceSettlement(
          {
            loanId: "adv-1",
            settlementDate: "2026-10-25",
            actualExpenseAmount: 1200000,
            refundAmount: 200000,
            refundRekeningId: "rek-1"
          },
          actor
        )
      ).rejects.toThrow(/sisa kas yang dikembalikan harus tepat/i);
    });

    it("successfully settles advance when actual expense Rp 1.200.000 + refund Rp 300.000 = Rp 1.500.000", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "adv-1",
        employeeId: "emp-2",
        loanType: "UANG_MUKA",
        status: "ACTIVE",
        amount: 1500000,
        employee: { name: "Ahmad" }
      });

      mocks.prisma.operationalAdvanceSettlement.create.mockResolvedValue({
        id: "settle-1",
        actualExpenseAmount: 1200000,
        refundAmount: 300000
      });

      mocks.prisma.employeeLoan.update.mockImplementation(async ({ data }: any) => ({
        id: "adv-1",
        ...data
      }));

      mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit-3" });

      const result = await recordAdvanceSettlement(
        {
          loanId: "adv-1",
          settlementDate: "2026-10-25",
          actualExpenseAmount: 1200000,
          refundAmount: 300000,
          refundRekeningId: "rek-1",
          notes: "Tuntas"
        },
        actor
      );

      expect(mocks.prisma.employeeLoan.update).toHaveBeenCalledWith({
        where: { id: "adv-1" },
        data: {
          paidAmount: 1500000,
          remainingAmount: 0,
          status: "SETTLED"
        }
      });
      expect(result.loan.status).toBe("SETTLED");
      expect(result.loan.remainingAmount).toBe(0);
    });

    it("successfully settles advance when actual expense Rp 1.800.000 exceeds advance Rp 1.500.000 (reimbursement case)", async () => {
      mocks.prisma.employeeLoan.findUnique.mockResolvedValue({
        id: "adv-1",
        employeeId: "emp-2",
        loanType: "UANG_MUKA",
        status: "ACTIVE",
        amount: 1500000,
        employee: { name: "Ahmad" }
      });

      mocks.prisma.operationalAdvanceSettlement.create.mockResolvedValue({
        id: "settle-2",
        actualExpenseAmount: 1800000,
        refundAmount: 0
      });

      mocks.prisma.employeeLoan.update.mockImplementation(async ({ data }: any) => ({
        id: "adv-1",
        ...data
      }));

      mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit-4" });

      const result = await recordAdvanceSettlement(
        {
          loanId: "adv-1",
          settlementDate: "2026-10-25",
          actualExpenseAmount: 1800000,
          refundAmount: 0,
          notes: "Ada kelebihan biaya dinas ditalangi karyawan"
        },
        actor
      );

      expect(result.loan.status).toBe("SETTLED");
      expect(result.loan.remainingAmount).toBe(0);
    });
  });
});
