import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: { id: "owner-1", name: "Owner", role: "OWNER" },
  sendNeoCommand: vi.fn(),
  recordAudit: vi.fn(),
  findTipe: vi.fn(),
  rekeningForTipe: vi.fn(),
  createApprovalRequest: vi.fn(),
  approvalIsEnabled: vi.fn()
  ,
  saveExpenseRecord: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/api/neo", () => ({ sendNeoCommand: mocks.sendNeoCommand }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/business/masterData", () => ({ findTipe: mocks.findTipe, rekeningForTipe: mocks.rekeningForTipe }));
vi.mock("@/lib/approval/store", () => ({
  createApprovalRequest: mocks.createApprovalRequest,
  approvalIsEnabled: mocks.approvalIsEnabled
}));
vi.mock("@/lib/expenses/store", () => ({ saveExpenseRecord: mocks.saveExpenseRecord }));

import { createExpense } from "@/lib/api/expenses";

const expenseInput = {
  expenseDate: "2026-06-29",
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  rekeningId: "cash-w",
  rekeningNameSnapshot: "Kas Walk In",
  coaId: "Kas",
  coaNameSnapshot: "Kas",
  category: "Operasional",
  vendorName: "Vendor",
  description: "Biaya operasional",
  amount: 10000,
  paymentMethod: "Cash",
  attachmentUrl: "",
  notes: ""
};

describe("expense routing by tipe", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    vi.stubEnv("SALES_ERP_TYPE_CODES", "AJ");
    mocks.user = { id: "owner-1", name: "Owner", role: "OWNER" };
    mocks.sendNeoCommand.mockReset();
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { ok: true } });
    mocks.recordAudit.mockReset();
    mocks.findTipe.mockReset();
    mocks.rekeningForTipe.mockReset();
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash-w", name: "Kas Server", bank: "Cash", accountNumber: "-", tipeIds: ["W", "AJ"] }]);
    mocks.createApprovalRequest.mockReset();
    mocks.approvalIsEnabled.mockReset();
    mocks.approvalIsEnabled.mockReturnValue(false);
    mocks.saveExpenseRecord.mockReset();
    mocks.saveExpenseRecord.mockImplementation(async (expense) => expense);
  });

  it("sends AJ expenses to ERP", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    await expect(createExpense({ ...expenseInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" })).resolves.toMatchObject({ success: true, data: { erpSyncStatus: "synced" } });

    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Tipe AJ")
    }));
    expect(mocks.saveExpenseRecord).toHaveBeenCalledWith(expect.objectContaining({ erpSyncTarget: "erp", erpSyncStatus: "synced", rekeningNameSnapshot: "Kas Server" }));
  });

  it("keeps AJ expenses as failed/retryable when ERP rejects it", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.sendNeoCommand.mockResolvedValue({ success: false, code: "ERP_TIMEOUT", message: "raw timeout" });

    await expect(createExpense({ ...expenseInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" })).resolves.toMatchObject({ success: true, data: { erpSyncStatus: "failed", retryable: true } });

    expect(mocks.saveExpenseRecord).toHaveBeenCalledWith(expect.objectContaining({
      erpSyncTarget: "erp",
      erpSyncStatus: "failed",
      erpSyncError: "ERP timeout saat sinkronisasi."
    }));
  });

  it("keeps non-AJ expenses local without calling ERP", async () => {
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });

    await expect(createExpense(expenseInput)).resolves.toMatchObject({
      success: true,
      data: { erpSyncTarget: "local", erpSyncStatus: "not_required" }
    });

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
    expect(mocks.saveExpenseRecord).toHaveBeenCalledWith(expect.objectContaining({ erpSyncTarget: "local", erpSyncStatus: "not_required" }));
  });

  it("stores pending AJ expenses without sending ERP when approval is required", async () => {
    mocks.user = { id: "admin-1", name: "Admin", role: "ADMIN" };
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.approvalIsEnabled.mockReturnValue(true);

    await expect(createExpense({ ...expenseInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" })).resolves.toMatchObject({
      success: true,
      data: { approvalStatus: "pending_approval", erpSyncTarget: "erp", erpSyncStatus: "pending" }
    });

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
    expect(mocks.createApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({ module: "pengeluaran", tipeCodeSnapshot: "AJ" }));
  });

  it("rejects rekening that is not assigned to the selected tipe", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash-other", name: "Kas Lain", bank: "Cash", accountNumber: "-", tipeIds: ["W"] }]);

    await expect(createExpense({ ...expenseInput, tipeId: "AJ" })).rejects.toThrow("Rekening pengeluaran tidak tersedia");
    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
    expect(mocks.saveExpenseRecord).not.toHaveBeenCalled();
  });
});
