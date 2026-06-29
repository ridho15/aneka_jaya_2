import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: { id: "owner-1", name: "Owner", role: "OWNER" },
  sendNeoCommand: vi.fn(),
  recordAudit: vi.fn(),
  findTipe: vi.fn(),
  createApprovalRequest: vi.fn(),
  approvalIsEnabled: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/api/neo", () => ({ sendNeoCommand: mocks.sendNeoCommand }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/business/masterData", () => ({ findTipe: mocks.findTipe }));
vi.mock("@/lib/approval/store", () => ({
  createApprovalRequest: mocks.createApprovalRequest,
  approvalIsEnabled: mocks.approvalIsEnabled
}));

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
    mocks.createApprovalRequest.mockReset();
    mocks.approvalIsEnabled.mockReset();
    mocks.approvalIsEnabled.mockReturnValue(false);
  });

  it("sends AJ expenses to ERP", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    await expect(createExpense({ ...expenseInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" })).resolves.toMatchObject({ success: true });

    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Tipe AJ")
    }));
  });

  it("keeps non-AJ expenses local without calling ERP", async () => {
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });

    await expect(createExpense(expenseInput)).resolves.toMatchObject({
      success: true,
      data: { erpSyncStatus: "not_required" }
    });

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
  });
});
