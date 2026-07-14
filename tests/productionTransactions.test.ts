import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const tx = {
    salesRecord: { create: vi.fn(), update: vi.fn() },
    expenseRecord: { update: vi.fn() },
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
vi.mock("@/lib/sales/store", () => ({ saveSalesRecord: mocks.saveSalesRecord }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: vi.fn() }));

import { createSale } from "@/lib/api/sales";
import { updateApprovalStatus } from "@/lib/approval/store";
import { cancelTempo, payTempo, writeOffTempo } from "@/lib/tempo/store";

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
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { invoice_id: "INV-1" } });
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
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"product_id\":88")
    }));
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
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.saveSalesRecord).toHaveBeenCalledOnce();
  });

  it("creates or resolves manual products in ERP before saving a non-AJ sale locally", async () => {
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
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.saveSalesRecord).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ productRef: "QA-NON-AJ-001", productId: "299", manualProduct: expect.any(Object) })]
    }));
  });

  it("creates manual products in ERP while keeping mixed non-AJ sales local", async () => {
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
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
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

  it("keeps an AJ sale locally as failed/retryable when ERP rejects it", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.anikaRequest.mockResolvedValue({ success: false, code: "ERP_UPSTREAM", message: "ERP gagal." });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncTarget: "erp",
        syncStatus: "failed",
        syncError: "ERP gagal."
      })
    }));
    expect(mocks.saveSalesRecord).not.toHaveBeenCalled();
  });

  it("stores a concise HPP/COA error when ERP cannot post the sales invoice", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.anikaRequest.mockResolvedValue({
      success: false,
      code: "ERP_UPSTREAM",
      message: "Sales invoice tidak dapat diposting karena HPP / release barang terkirim tidak dapat dihitung. Pastikan item invoice atau delivery order memiliki cost_price dan mapping COA yang valid."
    });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncError: "ERP menolak invoice: HPP/COA produk belum valid."
      })
    }));
  });

  it("keeps an AJ sale failed when auto-create customer is disabled and customer is missing", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [] });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncError: expect.stringContaining("Customer ERP tidak ditemukan")
      })
    }));
  });

  it("does not use a fallback customer for AJ manual customers", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "WALK-IN");
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      customerName: "Ridho Manual",
      customerLocation: "Toko Selatan"
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.listErpPaginated).toHaveBeenNthCalledWith(1, "/customers", expect.objectContaining({
      query: { name: "Ridho Manual" }
    }));
    expect(mocks.listErpPaginated).toHaveBeenNthCalledWith(2, "/customers", expect.objectContaining({
      query: { code: "Ridho Manual" }
    }));
    expect(mocks.listErpPaginated).toHaveBeenCalledTimes(2);
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
  });

  it("uses a configured Walk In ERP customer instead of auto-creating a generic Walk In customer", async () => {
    vi.stubEnv("ANIKA_ERP_WALK_IN_CUSTOMER_CODE", "WALK-IN");
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    vi.stubEnv("SALES_ERP_TYPE_CODES", "AJ,W");
    mocks.listErpPaginated.mockResolvedValueOnce({ success: true, data: [{ id: 88, code: "WALK-IN", name: "Walk In" }] });
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { invoice_id: "INV-WALK-IN" } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" } });

    await expect(createSale({
      ...saleInput,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Walk In",
      paymentMethod: "Tempo"
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced", erpReference: "INV-WALK-IN" } });

    expect(mocks.listErpPaginated).toHaveBeenCalledWith("/customers", expect.objectContaining({ query: { code: "WALK-IN" } }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      body: expect.stringContaining("\"customer_id\":88")
    }));
    expect(mocks.anikaRequest).not.toHaveBeenCalledWith("/customers", expect.anything());
  });

  it("auto-creates an ERP customer for AJ manual customers before creating the sale", async () => {
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "true");
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 123, code: "SLM-RIDHO" } } })
      .mockResolvedValueOnce({ success: true, data: { invoice_id: "INV-AUTO-CUSTOMER" } });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      customerName: "Ridho Manual",
      customerLocation: "Toko Selatan"
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });

    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(1, "/customers", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"name\":\"Ridho Manual\"")
    }));
    const customerPayload = JSON.parse(mocks.anikaRequest.mock.calls[0][1].body);
    expect(customerPayload).toMatchObject({
      name: "Ridho Manual",
      address: "Toko Selatan",
      telephone: "-",
      phone: "-",
      perusahaan: "Ridho Manual",
      tipe: "PRI",
      fax: "-",
      isSpecial: "0",
      tempo_kredit: 0,
      kredit_limit: 0,
      tipe_pembayaran: "Bebas",
      cabang_id: 1,
      nik_npwp: "-"
    });
    for (const key of ["address", "telephone", "phone", "fax", "nik_npwp", "tipe", "tipe_pembayaran", "isSpecial", "cabang_id"]) {
      expect(customerPayload[key]).not.toBeNull();
      expect(customerPayload[key]).not.toBe("");
    }
    expect(customerPayload.email).toMatch(/^customer\+slm-ridho-manual-.+@slm\.localhost\.test$/);
    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(2, "/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"customer_id\":123")
    }));
  });

  it("keeps an AJ sale failed when auto-create customer is rejected by ERP", async () => {
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "true");
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });
    mocks.anikaRequest.mockResolvedValueOnce({ success: false, code: "ERP_VALIDATION", message: "ERP menolak payload: isSpecial wajib diisi" });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.anikaRequest).toHaveBeenCalledTimes(1);
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/customers", expect.objectContaining({ method: "POST" }));
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncError: "ERP menolak create customer: isSpecial wajib diisi."
      })
    }));
  });

  it("keeps an AJ sale failed when the ERP product cannot be resolved", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.listProducts.mockResolvedValue({ success: true, data: [] });

    await expect(createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ" }))
      .resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncError: expect.stringContaining("Produk ERP tidak ditemukan")
      })
    }));
  });

  it("creates an official ERP product before AJ sales when a manual SKU is new", async () => {
    vi.stubEnv("ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE", "500");
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 199 });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      items: [{
        productRef: "QA-SLM-001",
        productInputMode: "manual",
        manualProduct: { sku: "QA-SLM-001", name: "QA Manual Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
        quantity: 1,
        unitPrice: 123000,
        discount: 0
      }]
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });

    expect(mocks.findProductIdBySku).toHaveBeenCalledWith("QA-SLM-001");
    expect(mocks.createOfficialProduct).toHaveBeenCalledWith(expect.objectContaining({
      sku: "QA-SLM-001",
      name: "QA Manual Product",
      productCategoryId: 5,
      uomId: 2,
      brandCode: "UMUM",
      sellPrice: 123000,
      costPrice: 500
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"product_id\":199")
    }));
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ productRef: "QA-SLM-001", productId: "199", manualProduct: expect.any(Object) })] }
      })
    }));
  });

  it("sends mixed ERP-existing and manual products in one AJ sales payload", async () => {
    vi.stubEnv("ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE", "500");
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 302 });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      items: [
        { productRef: "P-1", productId: "88", quantity: 2, unitPrice: 10000, discount: 1000 },
        {
          productRef: "QA-MIXED-AJ",
          productInputMode: "manual",
          manualProduct: { sku: "QA-MIXED-AJ", name: "QA Mixed AJ Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
          quantity: 1,
          unitPrice: 123000,
          discount: 0
        }
      ]
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });

    expect(mocks.findProductIdBySku).toHaveBeenCalledWith("QA-MIXED-AJ");
    expect(mocks.createOfficialProduct).toHaveBeenCalledWith(expect.objectContaining({
      sku: "QA-MIXED-AJ",
      name: "QA Mixed AJ Product",
      sellPrice: 123000,
      costPrice: 500
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"product_id\":88")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"product_id\":302")
    }));
    const salesPayload = JSON.parse(mocks.anikaRequest.mock.calls.find((call) => call[0] === "/sales")?.[1].body);
    expect(salesPayload.items).toEqual([
      expect.objectContaining({ product_id: 88, quantity: 2, unit_price: 10000, discount: 1000 }),
      expect.objectContaining({ product_id: 302, quantity: 1, unit_price: 123000, discount: 0 })
    ]);
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: {
          create: [
            expect.objectContaining({ productRef: "P-1", productId: "88" }),
            expect.objectContaining({ productRef: "QA-MIXED-AJ", productId: "302", manualProduct: expect.any(Object) })
          ]
        }
      })
    }));
  });

  it("keeps a manual AJ product failed before create when cost price is unavailable", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      items: [{
        productRef: "QA-SLM-NO-COST",
        productInputMode: "manual",
        manualProduct: { sku: "QA-SLM-NO-COST", name: "No Cost Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM", sellingPrice: 0, costPrice: 0 },
        quantity: 1,
        unitPrice: 123000,
        discount: 0
      }]
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "failed", retryable: true } });

    expect(mocks.createOfficialProduct).not.toHaveBeenCalled();
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        syncError: expect.stringContaining("Harga modal produk QA-SLM-NO-COST wajib diisi")
      })
    }));
  });

  it("uses an existing ERP product id for a manual SKU without creating a duplicate", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: 188 });

    await expect(createSale({
      ...saleInput,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      tipeNameSnapshot: "AJ",
      items: [{
        productRef: "QA-SLM-EXISTING",
        productInputMode: "manual",
        manualProduct: { sku: "QA-SLM-EXISTING", name: "Existing Manual Product", productCategoryId: 5, uomId: 2, brandCode: "UMUM" },
        quantity: 1,
        unitPrice: 50000,
        discount: 0
      }]
    })).resolves.toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });

    expect(mocks.createOfficialProduct).not.toHaveBeenCalled();
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      body: expect.stringContaining("\"product_id\":188")
    }));
  });

  it("marks Owner AJ test transactions in the Neo payload and response", async () => {
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    const result = await createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ", isTestTransaction: true });

    expect(result).toMatchObject({ success: true, data: { target: "erp", isTestTransaction: true } });
    expect((result as { data: { testReference: string } }).data.testReference).toMatch(/^TEST-AJ-/);
    expect(mocks.listErpPaginated).toHaveBeenCalledWith("/customers", expect.objectContaining({
      query: expect.objectContaining({ name: "Budi" })
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      body: expect.stringContaining("\"customer_id\":77")
    }));
  });

  it("ignores the test flag from non-Owner users", async () => {
    mocks.user = { id: "actor-2", name: "Admin", role: "ADMIN" };
    mocks.findTipe.mockResolvedValue({ id: "AJ", code: "AJ", name: "AJ" });

    const result = await createSale({ ...saleInput, tipeId: "AJ", tipeCodeSnapshot: "AJ", tipeNameSnapshot: "AJ", isTestTransaction: true });

    expect(result).toMatchObject({ success: true, data: { target: "erp", isTestTransaction: false, approvalStatus: "approved" } });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.any(Object));
    expect(mocks.tx.approvalRequest.create).not.toHaveBeenCalled();
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: "approved" })
    }));
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
    })).resolves.toMatchObject({ success: true, data: { target: "erp", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" } });

    expect(mocks.resolveSalesRekening).toHaveBeenCalledWith("Cash", "AJ", undefined);
    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rekeningId: "cash-w" })
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
    })).resolves.toMatchObject({ success: true, data: { target: "erp", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" } });

    expect(mocks.tx.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rekeningId: "cash-w" })
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
