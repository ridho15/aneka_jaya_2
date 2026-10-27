import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { pengeluaranSchema } from "@/lib/validation/pengeluaranSchema";
import { employeeSchema, loanRepaymentSchema, advanceSettlementSchema } from "@/lib/validation/sdmSchema";
import { can, type Role } from "@/lib/auth/roles";
import { buildFinanceReportSummary } from "@/lib/reports/summary";
import type { Expense } from "@/lib/types/expenses";

describe("SDM Phase 1 - Validation & Data Schemas", () => {
  it("requires employeeId and purpose when categoryCode is employee_loan", () => {
    const invalidData = {
      expenseDate: "2026-10-25",
      tipeId: "W",
      rekeningId: "rek-1",
      rekeningNameSnapshot: "Kas Operasional",
      categoryCode: "employee_loan" as const,
      category: "Kasbon pribadi",
      vendorName: "Budi",
      description: "Pinjaman kasbon",
      amount: 1000000,
      paymentMethod: "Transfer"
    };

    const result = pengeluaranSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.employeeId).toBeDefined();
      expect(fieldErrors.purpose).toBeDefined();
    }
  });

  it("passes when employee_loan has employeeId and purpose", () => {
    const validData = {
      expenseDate: "2026-10-25",
      tipeId: "W",
      rekeningId: "rek-1",
      rekeningNameSnapshot: "Kas Operasional",
      categoryCode: "employee_loan" as const,
      category: "Kasbon pribadi",
      employeeId: "emp-123",
      purpose: "Keperluan keluarga mendesak",
      dueDate: "2026-11-25",
      vendorName: "Budi Santoso",
      description: "Kasbon karyawan Budi",
      amount: 1000000,
      paymentMethod: "Transfer"
    };

    const result = pengeluaranSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("requires employeeId and salaryPeriod (YYYY-MM) when categoryCode is salary", () => {
    const invalidData = {
      expenseDate: "2026-10-25",
      tipeId: "W",
      rekeningId: "rek-1",
      rekeningNameSnapshot: "Kas Operasional",
      categoryCode: "salary" as const,
      category: "Gaji",
      vendorName: "Siti Rahma",
      description: "Gaji Oktober",
      amount: 4500000,
      paymentMethod: "Transfer"
    };

    const result = pengeluaranSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.employeeId).toBeDefined();
      expect(fieldErrors.salaryPeriod).toBeDefined();
    }
  });

  it("accepts valid salary data with salaryPeriod YYYY-MM", () => {
    const validData = {
      expenseDate: "2026-10-25",
      tipeId: "W",
      rekeningId: "rek-1",
      rekeningNameSnapshot: "Kas Operasional",
      categoryCode: "salary" as const,
      category: "Gaji",
      employeeId: "emp-456",
      salaryPeriod: "2026-10",
      vendorName: "Siti Rahma",
      description: "Pembayaran gaji bersih Siti Rahma Oktober 2026",
      amount: 4500000,
      paymentMethod: "Transfer"
    };

    const result = pengeluaranSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salaryPaymentType).toBe("EXPENSE");
    }
  });

  it("accepts salary with explicit salaryPaymentType PAYABLE or EXPENSE", () => {
    const baseData = {
      expenseDate: "2026-10-25",
      tipeId: "W",
      rekeningId: "rek-1",
      rekeningNameSnapshot: "Kas Operasional",
      categoryCode: "salary" as const,
      category: "Gaji",
      employeeId: "emp-456",
      salaryPeriod: "2026-10",
      vendorName: "Siti Rahma",
      description: "Pelunasan utang gaji Siti Rahma",
      amount: 4500000,
      paymentMethod: "Transfer"
    };

    const payableResult = pengeluaranSchema.safeParse({
      ...baseData,
      salaryPaymentType: "PAYABLE"
    });
    expect(payableResult.success).toBe(true);
    if (payableResult.success) {
      expect(payableResult.data.salaryPaymentType).toBe("PAYABLE");
    }

    const expenseResult = pengeluaranSchema.safeParse({
      ...baseData,
      salaryPaymentType: "EXPENSE"
    });
    expect(expenseResult.success).toBe(true);
    if (expenseResult.success) {
      expect(expenseResult.data.salaryPaymentType).toBe("EXPENSE");
    }

    const invalidResult = pengeluaranSchema.safeParse({
      ...baseData,
      salaryPaymentType: "INVALID"
    });
    expect(invalidResult.success).toBe(false);
  });

  it("validates employee master data schema and supports nullish optional fields from UI", () => {
    // No-happy path: empty name
    const invalidEmpty = employeeSchema.safeParse({ name: "" });
    expect(invalidEmpty.success).toBe(false);

    // No-happy path: whitespace-only required fields
    const invalidWhitespace = employeeSchema.safeParse({
      name: "   ",
      position: "   ",
      department: "   "
    });
    expect(invalidWhitespace.success).toBe(false);
    if (!invalidWhitespace.success) {
      const errors = invalidWhitespace.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.position).toBeDefined();
      expect(errors.department).toBeDefined();
    }

    // No-happy path: character overflow
    const invalidOverflow = employeeSchema.safeParse({
      name: "A".repeat(125),
      position: "Staff",
      department: "Keuangan",
      nik: "1".repeat(55),
      notes: "C".repeat(505)
    });
    expect(invalidOverflow.success).toBe(false);

    // Happy path: complete data
    const valid = employeeSchema.safeParse({
      name: "Ahmad Dahlan",
      position: "Staff Keuangan",
      department: "Keuangan",
      bankName: "BCA",
      bankAccountNumber: "1234567890"
    });
    expect(valid.success).toBe(true);

    // No-happy path / edge case fix: nullish fields sent by modal form when optional fields are empty
    const validWithNulls = employeeSchema.safeParse({
      name: "Siti Rahma",
      position: "Staff Gudang",
      department: "Logistik",
      nik: null,
      managerId: null,
      bankName: null,
      bankAccountNumber: null,
      notes: null
    });
    expect(validWithNulls.success).toBe(true);
    if (validWithNulls.success) {
      expect(validWithNulls.data.nik).toBeNull();
      expect(validWithNulls.data.managerId).toBeNull();
      expect(validWithNulls.data.isActive).toBe(true);
    }
  });

  it("validates loan repayment schema and enforces payroll notes for potong gaji", () => {
    const withoutNotes = loanRepaymentSchema.safeParse({
      loanId: "loan-1",
      paymentDate: "2026-10-25",
      amount: 500000,
      paymentMethod: "POTONG_GAJI"
    });
    expect(withoutNotes.success).toBe(false);

    const withNotes = loanRepaymentSchema.safeParse({
      loanId: "loan-1",
      paymentDate: "2026-10-25",
      amount: 500000,
      paymentMethod: "POTONG_GAJI",
      payrollReference: "Potong Gaji Slip Periode 2026-10"
    });
    expect(withNotes.success).toBe(true);

    const transferWithoutRek = loanRepaymentSchema.safeParse({
      loanId: "loan-1",
      paymentDate: "2026-10-25",
      amount: 500000,
      paymentMethod: "TRANSFER"
    });
    expect(transferWithoutRek.success).toBe(false);

    const transferWithRek = loanRepaymentSchema.safeParse({
      loanId: "loan-1",
      paymentDate: "2026-10-25",
      amount: 500000,
      paymentMethod: "TRANSFER",
      rekeningId: "rek-bca"
    });
    expect(transferWithRek.success).toBe(true);
  });

  it("validates operational advance settlement schema", () => {
    const valid = advanceSettlementSchema.safeParse({
      loanId: "adv-1",
      settlementDate: "2026-10-25",
      actualExpenseAmount: 1200000,
      refundAmount: 300000,
      refundRekeningId: "rek-1",
      notes: "Nota dinas terlampir lengkap"
    });
    expect(valid.success).toBe(true);
  });
});

describe("SDM Phase 1 - Finance Report Isolation", () => {
  it("separates kasbon from operational expenses in executive summary", () => {
    const approvedExpenses: Expense[] = [
      {
        id: "exp-1",
        expenseDate: "2026-10-10",
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        rekeningId: "rek-1",
        rekeningNameSnapshot: "Kas Operasional",
        coaId: "Operasional",
        coaNameSnapshot: "Operasional",
        category: "Biaya Listrik",
        categoryCode: "operational_expense",
        vendorName: "PLN",
        description: "Tagihan listrik toko",
        amount: 1500000,
        paymentMethod: "Transfer",
        approvalStatus: "approved"
      },
      {
        id: "exp-2",
        expenseDate: "2026-10-12",
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        rekeningId: "rek-1",
        rekeningNameSnapshot: "Kas Operasional",
        coaId: "Kas",
        coaNameSnapshot: "Kas",
        category: "Kasbon pribadi",
        categoryCode: "employee_loan",
        employeeId: "emp-1",
        vendorName: "Budi Santoso",
        description: "Kasbon Budi",
        amount: 1000000,
        paymentMethod: "Transfer",
        approvalStatus: "approved"
      },
      {
        id: "exp-3",
        expenseDate: "2026-10-25",
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        rekeningId: "rek-1",
        rekeningNameSnapshot: "Kas Operasional",
        coaId: "Operasional",
        coaNameSnapshot: "Operasional",
        category: "Gaji Karyawan",
        categoryCode: "salary",
        employeeId: "emp-2",
        salaryPeriod: "2026-10",
        vendorName: "Siti Rahma",
        description: "Gaji Siti",
        amount: 4000000,
        paymentMethod: "Transfer",
        approvalStatus: "approved"
      }
    ];

    const report = buildFinanceReportSummary({
      month: "2026-10",
      tempo: [],
      payments: [],
      reversals: [],
      expenses: approvedExpenses
    });

    // Kasbon is isolated and does NOT inflate operational expenses
    expect(report.kasbonDisbursedTotal).toBe(1000000);
    expect(report.operationalExpenseTotal).toBe(1500000);
    expect(report.salaryExpenseTotal).toBe(4000000);

    // Overall legacy total remains sum for backward compatibility
    expect(report.approvedExpenseTotal).toBe(6500000);
  });
});

describe("SDM Phase 1 - Role Permissions", () => {
  it("allows Owner and Finance to view SDM and salary", () => {
    expect(can("OWNER" as Role, "sdm.view")).toBe(true);
    expect(can("FINANCE" as Role, "sdm.view")).toBe(true);
    expect(can("MANAGER" as Role, "sdm.view")).toBe(true);

    expect(can("OWNER" as Role, "sdm.salary.view")).toBe(true);
    expect(can("FINANCE" as Role, "sdm.salary.view")).toBe(true);
    expect(can("SUPERVISOR" as Role, "sdm.salary.view")).toBe(false); // salary is confidential from supervisor
  });

  it("denies Delivery Driver and Viewer from accessing SDM Salary and managing Kasbon", () => {
    expect(can("DELIVERY_DRIVER" as Role, "sdm.salary.view")).toBe(false);
    expect(can("VIEWER" as Role, "sdm.salary.view")).toBe(false);

    expect(can("DELIVERY_DRIVER" as Role, "sdm.kasbon.manage")).toBe(false);
    expect(can("VIEWER" as Role, "sdm.kasbon.manage")).toBe(false);

    expect(can("DELIVERY_DRIVER" as Role, "sdm.employee.manage")).toBe(false);
    expect(can("FINANCE" as Role, "sdm.employee.manage")).toBe(false);
    expect(can("MANAGER" as Role, "sdm.employee.manage")).toBe(true);
  });
});
