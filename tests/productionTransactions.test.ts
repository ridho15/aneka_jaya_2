import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const tx = {
    salesRecord: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    expenseRecord: { update: vi.fn() },
    approvalRequest: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tempoReceivable: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tempoPayment: { create: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (transactionClient: unknown) => unknown) => callback(tx))
    },
    user: { id: "actor-1", name: "Actor", role: "OWNER" },
    sendNeoCommand: vi.fn(),
    anikaRequest: vi.fn(),
    listProducts: vi.fn(),
    findProductIdBySku: vi.fn(),
    createOfficialProduct: vi.fn(),
    listErpPaginated: vi.fn(),
    findTipe: vi.fn(),
    rekeningForTipe: vi.fn(),
    resolveSalesRekening: vi.fn(),
    saveSalesRecord: vi.fn()
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
  getCurrentRole: vi.fn(async () => mocks.user.role)
}));
vi.mock("@/lib/api/neo", () => ({ sendNeoCommand: mocks.sendNeoCommand }));
vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));
vi.mock("@/lib/api/products", () => ({ listProducts: mocks.listProducts, findProductIdBySku: mocks.findProductIdBySku, createOfficialProduct: mocks.createOfficialProduct }));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: mocks.listErpPaginated }));
vi.mock("@/lib/business/masterData", () => ({
  findTipe: mocks.findTipe,
  rekeningForTipe: mocks.rekeningForTipe,
  resolveSalesRekening: mocks.resolveSalesRekening,
  MasterDataError: class MasterDataError extends Error {}
}));
vi.mock("@/lib/sales/store", () => ({
  saveSalesRecord: mocks.saveSalesRecord,
  allocateTransactionIdentity: vi.fn(async (_tx: unknown, transactionAt: string) => ({
    transactionAt,
    transactionDateKey: "2026-06-27",
    transactionSequence: 1,
    transactionNumber: "270626-01"
  }))
}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: vi.fn() }));

import { createSale } from "@/lib/api/sales";
import { updateApprovalStatus } from "@/lib/approval/store";
import { cancelTempo, createTempoReceivableInTransaction, payTempo, writeOffTempo } from "@/lib/tempo/store";

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
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "false");
    vi.stubEnv("ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE", "");
    mocks.user = { id: "actor-1", name: "Actor", role: "OWNER" };
    mocks.sendNeoCommand.mockReset();
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { ok: true } });
    mocks.anikaRequest.mockReset();
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { status: "released", releaseReference: "SLM-STOCK-1" } });
    mocks.listProducts.mockReset();
    mocks.listProducts.mockResolvedValue({ success: true, data: [{ id: "88", productId: "88", code: "P-1", name: "Produk 1" }] });
    mocks.findProductIdBySku.mockReset();
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockReset();
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 99 });
    mocks.listErpPaginated.mockReset();
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [{ id: 77, name: "Budi", code: "BUDI" }] });
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.rekeningForTipe.mockResolvedValue([]);
    mocks.resolveSalesRekening.mockReset();
    mocks.resolveSalesRekening.mockResolvedValue(undefined);
    mocks.saveSalesRecord.mockReset();
    mocks.prisma.$transaction.mockClear();
    Object.values(mocks.tx).forEach((model) => Object.values(model).forEach((fn) => "mockReset" in fn && fn.mockReset()));
    mocks.tx.expenseRecord.update.mockResolvedValue({});
  });

  it("creates approved production Tempo sales atomically with receivable, audit rows, and AJ stock release", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    const input = { ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" };
    await expect(createSale(input)).resolves.toMatchObject({
      success: true,
      data: { target: "local", syncTarget: "local", stockReleaseStatus: "released" }
    });

    expect(mocks.saveSalesRecord).toHaveBeenCalledOnce();
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      stockReleaseStatus: "released"
    }), expect.objectContaining({ tempo: expect.anything() }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"sku\":\"P-1\"")
    }));
    expect(mocks.tx.approvalRequest.create).not.toHaveBeenCalled();
  });

  it("creates an initial Tempo payment and partial receivable atomically", async () => {
    mocks.tx.salesRecord.findUnique.mockResolvedValue({ syncTarget: "local" });
    mocks.tx.tempoPayment.create.mockResolvedValue({ id: "TPY-INITIAL-S-1", tempoReceivableId: "TMP-1", paymentDate: new Date("2026-06-27"), amountPaid: 5_000, paymentMethod: "Cash", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In", erpPaymentStatus: "not_required", createdByUserId: "actor-1", createdByNameSnapshot: "Actor", createdAt: new Date("2026-06-27") });
    await expect(createTempoReceivableInTransaction(mocks.tx as never, { salesId: "S-1", tipeId: "W", tipeCodeSnapshot: "W", tipeNameSnapshot: "Walk In", customerName: "Budi", originalAmount: 20_000, transactionDate: "2026-06-27", dueDate: "2026-07-27", initialPayment: { amount: 5_000, method: "Cash", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" } }, mocks.user)).resolves.toMatchObject({ receivable: { paidAmount: 5_000, remainingAmount: 15_000, status: "partial_paid" } });
    expect(mocks.tx.tempoReceivable.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ originalAmount: 20_000, paidAmount: 5_000, remainingAmount: 15_000, status: "partial_paid" }) }));
    expect(mocks.tx.tempoPayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: expect.stringContaining("TPY-INITIAL-"), amountPaid: 5_000, paymentMethod: "Cash", rekeningId: "cash-w" }) }));
  });

  it.each(["W", "ONLINE"])("keeps %s sales local while releasing stock to AJ", async (code) => {
    mocks.findTipe.mockResolvedValue({ id: code, code, name: code });

    await expect(createSale({ ...saleInput, tipeId: code, tipeCodeSnapshot: code, tipeNameSnapshot: code, paymentMethod: "Other", dueDate: undefined }))
      .resolves.toMatchObject({ success: true, data: { target: "local", syncTarget: "local", stockReleaseStatus: "released" } });

    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({ method: "POST" }));
    expect(mocks.saveSalesRecord).toHaveBeenCalledOnce();
  });

  it("treats a legacy saleDate without transactionAt as midnight in Jakarta", async () => {
    await expect(createSale({ ...saleInput, paymentMethod: "Other", dueDate: undefined }))
      .resolves.toMatchObject({ success: true, data: { saleDate: "2026-06-27", transactionAt: "2026-06-26T17:00:00.000Z" } });

    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      saleDate: "2026-06-27",
      transactionAt: "2026-06-26T17:00:00.000Z"
    }));
  });

  it("uses the Jakarta date derived from transactionAt for stock release payloads", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      paymentMethod: "Other",
      dueDate: undefined,
      saleDate: "2026-06-27",
      transactionAt: "2026-06-28T00:05",
      deliveryAt: "2026-06-29T00:15"
    })).resolves.toMatchObject({ success: true, data: { saleDate: "2026-06-28", transactionAt: "2026-06-27T17:05:00.000Z", deliveryAt: "2026-06-28T17:15:00.000Z" } });

    const postedBodies = mocks.anikaRequest.mock.calls
      .map(([, options]) => options?.body)
      .filter((body): body is string => typeof body === "string");
    expect(postedBodies.length).toBeGreaterThan(0);
    expect(postedBodies.some((body) => body.includes('"release_date":"2026-06-28"'))).toBe(true);
  });

  it("creates or resolves manual products in ERP before releasing stock and saving a sale locally", async () => {
    vi.stubEnv("ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE", "500");
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 299 });

    await expect(createSale({
      ...saleInput,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      paymentMethod: "Other",
      dueDate: undefined,
      items: [{
        productRef: "QA-NON-AJ-001",
        productInputMode: "manual",
        manualProduct: { sku: "QA-NON-AJ-001", name: "QA Non AJ Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
        quantity: 1,
        unitPrice: 75000,
        discount: 0
      }]
    })).resolves.toMatchObject({ success: true, data: { target: "local", syncTarget: "local", syncStatus: "local" } });

    expect(mocks.findProductIdBySku).toHaveBeenCalledWith("QA-NON-AJ-001");
    expect(mocks.createOfficialProduct).toHaveBeenCalledWith(expect.objectContaining({
      sku: "QA-NON-AJ-001",
      sellPrice: 75000,
      costPrice: 500
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({ method: "POST" }));
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ productRef: "QA-NON-AJ-001", productId: "299", manualProduct: expect.any(Object) })]
    }));
  });

  it("creates manual products in ERP while keeping mixed sales local with stock release", async () => {
    vi.stubEnv("ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE", "500");
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 301 });

    await expect(createSale({
      ...saleInput,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      paymentMethod: "Other",
      dueDate: undefined,
      items: [
        { productRef: "P-1", productId: "88", quantity: 2, unitPrice: 10000, discount: 1000 },
        {
          productRef: "QA-MIXED-LOCAL",
          productInputMode: "manual",
          manualProduct: { sku: "QA-MIXED-LOCAL", name: "QA Mixed Local Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
          quantity: 1,
          unitPrice: 75000,
          discount: 0
        }
      ]
    })).resolves.toMatchObject({ success: true, data: { target: "local", syncTarget: "local", syncStatus: "local" } });

    expect(mocks.findProductIdBySku).toHaveBeenCalledWith("QA-MIXED-LOCAL");
    expect(mocks.createOfficialProduct).toHaveBeenCalledWith(expect.objectContaining({
      sku: "QA-MIXED-LOCAL",
      sellPrice: 75000,
      costPrice: 500
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({ method: "POST" }));
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ productRef: "P-1", productId: "88" }),
        expect.objectContaining({ productRef: "QA-MIXED-LOCAL", productId: "301", manualProduct: expect.any(Object) })
      ]
    }));
  });

  it("rejects a non-AJ sale when its manual product cannot be created in ERP", async () => {
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });

    await expect(createSale({
      ...saleInput,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      paymentMethod: "Other",
      dueDate: undefined,
      items: [{
        productRef: "QA-NON-AJ-NO-COST",
        productInputMode: "manual",
        manualProduct: { sku: "QA-NON-AJ-NO-COST", name: "No Cost Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
        quantity: 1,
        unitPrice: 75000,
        discount: 0
      }]
    })).resolves.toMatchObject({ success: false, code: "ERP_PRODUCT_REFERENCE_MISSING" });

    expect(mocks.createOfficialProduct).not.toHaveBeenCalled();
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.saveSalesRecord).not.toHaveBeenCalled();
  });

  it("releases stock to AJ and stores local sales record", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { status: "released", releaseReference: "SLM-STOCK-1" } });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({
        success: true,
        data: { target: "local", syncTarget: "local", stockReleaseStatus: "released" }
      });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"sku\":\"P-1\"")
    }));
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      stockReleaseStatus: "released"
    }), expect.anything());
  });

  it("handles idempotent already_released stock release from AJ gracefully", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { status: "already_released", releaseReference: "SLM-STOCK-1" } });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({
        success: true,
        data: { target: "local", syncTarget: "local", stockReleaseStatus: "already_released" }
      });

    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      stockReleaseStatus: "already_released"
    }), expect.anything());
  });

  it("fails sale creation when AJ stock release fails (e.g. stock insufficient)", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.anikaRequest.mockResolvedValueOnce({
      success: false,
      code: "stock_insufficient",
      details: {
        upstreamCode: "stock_insufficient",
        errors: {
          items: [{ product_id: 10, sku: "P-1", product_name: "Produk 1", requested_qty: 2, available_qty: 0, shortage_qty: 2 }]
        }
      }
    });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({
        success: false,
        message: "Stok di gudang tidak mencukupi untuk item: Produk 1 (minta: 2, tersedia: 0)."
      });

    expect(mocks.tx.salesRecord.create).not.toHaveBeenCalled();
  });

  it("uses Kas Walk In for Cash sales even when the request omits rekening", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.resolveSalesRekening.mockResolvedValue({ id: "cash-w", name: "Kas Walk In", tipeIds: ["W"] });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      paymentMethod: "Cash",
      dueDate: undefined
    })).resolves.toMatchObject({ success: true, data: { target: "local", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" } });

    expect(mocks.resolveSalesRekening).toHaveBeenCalledWith("Cash", "AJ", undefined);
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Kas Walk In"
    }));
  });

  it("ignores tampered Cash rekening and persists Kas Walk In", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.resolveSalesRekening.mockResolvedValue({ id: "cash-w", name: "Kas Walk In", tipeIds: ["W"] });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      paymentMethod: "Cash",
      dueDate: undefined,
      rekeningId: "cash-aj",
      rekeningNameSnapshot: "Kas AJ"
    })).resolves.toMatchObject({ success: true, data: { target: "local", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" } });

    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Kas Walk In"
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
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash", name: "Cash", tipeIds: ["W"] }]);

    await expect(payTempo("TMP-1", {
      paymentDate: "2026-06-28",
      amountPaid: 80,
      paymentMethod: "Cash",
      rekeningId: "cash",
      rekeningNameSnapshot: "Client Name"
    })).rejects.toThrow("Nominal dibayar tidak boleh lebih dari sisa Tempo.");

    expect(mocks.tx.tempoPayment.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects Tempo payment with an invalid rekening for the tipe", async () => {
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
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash-w", name: "Cash W", tipeIds: ["W"] }]);

    await expect(payTempo("TMP-1", {
      paymentDate: "2026-06-28",
      amountPaid: 80,
      paymentMethod: "Cash",
      rekeningId: "cash-aj",
      rekeningNameSnapshot: "Kas AJ"
    })).rejects.toThrow("Rekening penerima tidak tersedia");

    expect(mocks.tx.tempoPayment.create).not.toHaveBeenCalled();
  });

  it("uses the server rekening name when creating Tempo payment", async () => {
    mocks.tx.tempoReceivable.findUnique.mockResolvedValueOnce({
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
    }).mockResolvedValueOnce({
      id: "TMP-1",
      salesId: "S-1",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      originalAmount: 100,
      paidAmount: 80,
      remainingAmount: 20,
      transactionDate: new Date("2026-06-27"),
      dueDate: new Date("2026-07-27"),
      status: "open",
      createdByUserId: "u-1",
      createdByNameSnapshot: "User",
      createdAt: new Date("2026-06-27"),
      updatedAt: new Date("2026-06-27")
    });
    mocks.tx.tempoReceivable.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.tempoPayment.create.mockResolvedValue({
      id: "TPY-1",
      tempoReceivableId: "TMP-1",
      paymentDate: new Date("2026-06-28"),
      amountPaid: 80,
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Cash W",
      attachmentUrl: null,
      notes: null,
      createdByUserId: "actor-1",
      createdByNameSnapshot: "Actor",
      createdAt: new Date("2026-06-28")
    });
    mocks.tx.tempoReceivable.findUniqueOrThrow.mockResolvedValue({ remainingAmount: 20 });
    mocks.tx.tempoReceivable.update.mockResolvedValue({
      id: "TMP-1",
      salesId: "S-1",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      originalAmount: 100,
      paidAmount: 80,
      remainingAmount: 20,
      transactionDate: new Date("2026-06-27"),
      dueDate: new Date("2026-07-27"),
      status: "partial_paid",
      createdByUserId: "u-1",
      createdByNameSnapshot: "User",
      createdAt: new Date("2026-06-27"),
      updatedAt: new Date("2026-06-28")
    });
    mocks.rekeningForTipe.mockResolvedValue([{ id: "cash-w", name: "Cash W", tipeIds: ["W"] }]);

    await expect(payTempo("TMP-1", {
      paymentDate: "2026-06-28",
      amountPaid: 80,
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Tampered"
    })).resolves.toMatchObject({ payment: { rekeningNameSnapshot: "Cash W" } });

    expect(mocks.tx.tempoPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rekeningNameSnapshot: "Cash W" })
    }));
  });

  it("cancels active Tempo and records audit", async () => {
    const row = {
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
    };
    mocks.tx.tempoReceivable.findUnique.mockResolvedValue(row);
    mocks.tx.tempoReceivable.update.mockResolvedValue({ ...row, status: "cancelled", updatedAt: new Date("2026-06-28") });

    await expect(cancelTempo("TMP-1", "Customer membatalkan order")).resolves.toMatchObject({ status: "cancelled" });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "tempo", action: "cancel" })
    }));
  });

  it("write-offs active Tempo with remaining amount and records audit", async () => {
    const row = {
      id: "TMP-1",
      salesId: "S-1",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      originalAmount: 100,
      paidAmount: 30,
      remainingAmount: 70,
      transactionDate: new Date("2026-06-27"),
      dueDate: new Date("2026-07-27"),
      status: "partial_paid",
      createdByUserId: "u-1",
      createdByNameSnapshot: "User",
      createdAt: new Date("2026-06-27"),
      updatedAt: new Date("2026-06-27")
    };
    mocks.tx.tempoReceivable.findUnique.mockResolvedValue(row);
    mocks.tx.tempoReceivable.update.mockResolvedValue({ ...row, status: "written_off", updatedAt: new Date("2026-06-28") });

    await expect(writeOffTempo("TMP-1", "Sisa tidak tertagih")).resolves.toMatchObject({ status: "written_off" });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "tempo", action: "write_off" })
    }));
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

  it("updates ExpenseRecord when approving a pending expense", async () => {
    const beforeApproval = {
      id: "APR-EXP-1",
      module: "pengeluaran",
      entityId: "E-1",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
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

    await expect(updateApprovalStatus("APR-EXP-1", "approve")).resolves.toMatchObject({ status: "approved" });

    expect(mocks.tx.expenseRecord.update).toHaveBeenCalledWith({
      where: { id: "E-1" },
      data: { approvalStatus: "approved" }
    });
  });

  it("marks rejected ExpenseRecord as not required for ERP retry", async () => {
    const beforeApproval = {
      id: "APR-EXP-2",
      module: "pengeluaran",
      entityId: "E-2",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
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
      status: "rejected",
      rejectedByUserId: "actor-1",
      rejectedByNameSnapshot: "Actor",
      rejectedAt: new Date("2026-06-28"),
      rejectionReason: "Tidak valid"
    });

    await expect(updateApprovalStatus("APR-EXP-2", "reject", "Tidak valid")).resolves.toMatchObject({ status: "rejected" });

    expect(mocks.tx.expenseRecord.update).toHaveBeenCalledWith({
      where: { id: "E-2" },
      data: { approvalStatus: "rejected", erpSyncStatus: "not_required", erpSyncError: "Pengeluaran ditolak approval." }
    });
  });
});
