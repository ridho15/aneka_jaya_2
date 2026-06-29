import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const tx = {
    salesRecord: { create: vi.fn(), update: vi.fn() },
    approvalRequest: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tempoReceivable: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tempoPayment: { create: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (transactionClient: unknown) => unknown) => callback(tx))
    },
    user: { id: "actor-1", name: "Actor", role: "OWNER" },
    sendNeoCommand: vi.fn(),
    findTipe: vi.fn(),
    rekeningForTipe: vi.fn(),
    saveSalesRecord: vi.fn()
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
  getCurrentRole: vi.fn(async () => mocks.user.role)
}));
vi.mock("@/lib/api/neo", () => ({ sendNeoCommand: mocks.sendNeoCommand }));
vi.mock("@/lib/business/masterData", () => ({
  findTipe: mocks.findTipe,
  rekeningForTipe: mocks.rekeningForTipe,
  MasterDataError: class MasterDataError extends Error {}
}));
vi.mock("@/lib/sales/store", () => ({ saveSalesRecord: mocks.saveSalesRecord }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: vi.fn() }));

import { createSale } from "@/lib/api/sales";
import { updateApprovalStatus } from "@/lib/approval/store";
import { payTempo } from "@/lib/tempo/store";

const saleInput = {
  saleDate: "2026-06-27",
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  customerName: "Budi",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Tempo" as const,
  dueDate: "2026-07-27",
  items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
};

describe("production Prisma transactions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    vi.stubEnv("SALES_ERP_TYPE_CODES", "AJ");
    mocks.user = { id: "actor-1", name: "Actor", role: "OWNER" };
    mocks.sendNeoCommand.mockReset();
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { ok: true } });
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.rekeningForTipe.mockResolvedValue([]);
    mocks.saveSalesRecord.mockReset();
    mocks.prisma.$transaction.mockClear();
    Object.values(mocks.tx).forEach((model) => Object.values(model).forEach((fn) => "mockReset" in fn && fn.mockReset()));
  });

  it("creates approved production Tempo sales atomically with receivable and audit rows", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    const input = { ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" };
    await expect(createSale(input)).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledOnce();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ productRef: "P-1", sortOrder: 0 })] }
      })
    }));
    expect(mocks.tx.tempoReceivable.create).toHaveBeenCalledOnce();
    expect(mocks.tx.approvalRequest.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "sales", action: "create" })
    }));
  });

  it.each(["W", "ONLINE"])("keeps %s sales local without calling ERP", async (code) => {
    mocks.findTipe.mockResolvedValue({ id: code, code, name: code });

    await expect(createSale({ ...saleInput, tipeId: code, tipeCodeSnapshot: code, tipeNameSnapshot: code, paymentMethod: "Other", dueDate: undefined }))
      .resolves.toMatchObject({ success: true, data: { target: "local", syncTarget: "local" } });

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
    expect(mocks.saveSalesRecord).toHaveBeenCalledOnce();
  });

  it("does not persist an AJ sale when ERP rejects it", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.sendNeoCommand.mockResolvedValue({ success: false, code: "ERP_UPSTREAM", message: "ERP gagal." });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toEqual({ success: false, code: "ERP_UPSTREAM", message: "ERP gagal." });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.saveSalesRecord).not.toHaveBeenCalled();
  });

  it("marks Owner AJ test transactions in the Neo payload and response", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    const result = await createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ", isTestTransaction: true });

    expect(result).toMatchObject({ success: true, data: { target: "erp", isTestTransaction: true } });
    expect((result as { data: { testReference: string } }).data.testReference).toMatch(/^TEST-AJ-/);
    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("[TEST AJ]"),
      parsedIntent: expect.objectContaining({
        tipe_code_snapshot: "AJ",
        auto_create_invoice: true,
        is_test_transaction: true,
        test_reference: expect.stringMatching(/^TEST-AJ-/)
      })
    }));
  });

  it("ignores the test flag from non-Owner users", async () => {
    mocks.user = { id: "actor-2", name: "Admin", role: "ADMIN" };
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    const result = await createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ", isTestTransaction: true });

    expect(result).toMatchObject({ success: true, data: { target: "erp", isTestTransaction: false } });
    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      parsedIntent: expect.objectContaining({ is_test_transaction: false, test_reference: undefined })
    }));
  });

  it("rejects Cash AJ when the selected rekening is not assigned to AJ", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.rekeningForTipe.mockResolvedValue([]);

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      paymentMethod: "Cash",
      dueDate: undefined,
      rekeningId: "cash-aj"
    })).rejects.toThrow("Rekening penerima tidak tersedia");

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
  });

  it("sends Cash AJ when a real assigned rekening is available", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash-aj", name: "Kas AJ", tipeIds: ["AJ"] }]);

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      paymentMethod: "Cash",
      dueDate: undefined,
      rekeningId: "cash-aj",
      rekeningNameSnapshot: "Kas AJ"
    })).resolves.toMatchObject({ success: true, data: { target: "erp" } });

    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      parsedIntent: expect.objectContaining({ rekening_id: "cash-aj", tipe_code_snapshot: "AJ" })
    }));
  });

  it("does not create a Tempo payment when a concurrent update consumes the remaining amount", async () => {
    mocks.tx.tempoReceivable.findUnique.mockResolvedValue({
      id: "TMP-1",
      salesId: "S-1",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      originalAmount: 100,
      paidAmount: 0,
      remainingAmount: 100,
      transactionDate: new Date("2026-06-27"),
      dueDate: new Date("2026-07-27"),
      status: "open",
      createdByUserId: "u-1",
      createdByNameSnapshot: "User",
      createdAt: new Date("2026-06-27"),
      updatedAt: new Date("2026-06-27")
    });
    mocks.tx.tempoReceivable.updateMany.mockResolvedValue({ count: 0 });

    await expect(payTempo("TMP-1", {
      paymentDate: "2026-06-28",
      amountPaid: 80,
      paymentMethod: "Cash",
      rekeningId: "cash",
      rekeningNameSnapshot: "Cash"
    })).rejects.toThrow("Nominal dibayar tidak boleh lebih dari sisa Tempo.");

    expect(mocks.tx.tempoPayment.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate Tempo receivables when approving an already-linked Tempo sale", async () => {
    const beforeApproval = {
      id: "APR-1",
      module: "penjualan",
      entityId: "S-1",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      amount: 100,
      status: "pending_approval",
      createdByUserId: "admin-1",
      createdByNameSnapshot: "Admin",
      createdByRoleSnapshot: "ADMIN",
      createdAt: new Date("2026-06-27"),
      approvedByUserId: null,
      approvedByNameSnapshot: null,
      approvedAt: null,
      rejectedByUserId: null,
      rejectedByNameSnapshot: null,
      rejectedAt: null,
      rejectionReason: null
    };
    mocks.tx.approvalRequest.findUnique.mockResolvedValue(beforeApproval);
    mocks.tx.approvalRequest.update.mockResolvedValue({
      ...beforeApproval,
      status: "approved",
      approvedByUserId: "actor-1",
      approvedByNameSnapshot: "Actor",
      approvedAt: new Date("2026-06-28")
    });
    mocks.tx.salesRecord.update.mockResolvedValue({
      id: "S-1",
      paymentMethod: "Tempo",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      total: 100,
      saleDate: new Date("2026-06-27"),
      dueDate: new Date("2026-07-27")
    });
    mocks.tx.tempoReceivable.findUnique.mockResolvedValue({ id: "TMP-existing" });

    await expect(updateApprovalStatus("APR-1", "approve")).resolves.toMatchObject({ status: "approved" });

    expect(mocks.tx.tempoReceivable.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "approval", action: "approve" })
    }));
  });
});
