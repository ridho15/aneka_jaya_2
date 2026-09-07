import { beforeEach, describe, expect, it, vi } from "vitest";
import { immutablePayloadHash } from "@/lib/integrations/mj/hash";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  salesFind: vi.fn(), salesCreate: vi.fn(), salesUpdate: vi.fn(), salesUpdateMany: vi.fn(),
  tipeFind: vi.fn(), rekeningFind: vi.fn(), attemptCount: vi.fn(), attemptCreate: vi.fn(),
  tempoReceivableFind: vi.fn(), tempoReceivableUpdate: vi.fn(), tempoReceivableUpdateMany: vi.fn(), tempoPaymentFind: vi.fn(), tempoPaymentCreate: vi.fn(), tempoPaymentUpdate: vi.fn(),
  tempoPaymentReversalUpsert: vi.fn(), auditLogCreate: vi.fn(),
  customerMappingFind: vi.fn(), customerMappingUpsert: vi.fn(),
  createCustomer: vi.fn(), createInvoice: vi.fn(), releaseStock: vi.fn(), createPayment: vi.fn(),
  cancelErpSales: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    salesRecord: { create: mocks.salesCreate, update: mocks.salesUpdate },
    tempoReceivable: { create: vi.fn(), findUnique: mocks.tempoReceivableFind, update: mocks.tempoReceivableUpdate, updateMany: mocks.tempoReceivableUpdateMany },
    tempoPayment: { create: mocks.tempoPaymentCreate, update: mocks.tempoPaymentUpdate },
    tempoPaymentReversal: { upsert: mocks.tempoPaymentReversalUpsert },
    auditLog: { create: mocks.auditLogCreate },
    integrationStageAttempt: { create: mocks.attemptCreate, count: mocks.attemptCount }
  };
  return { prisma: {
    salesRecord: { findUnique: mocks.salesFind, update: mocks.salesUpdate, updateMany: mocks.salesUpdateMany },
    bookkeepingType: { findFirst: mocks.tipeFind }, rekeningAccount: { findFirst: mocks.rekeningFind },
    integrationStageAttempt: { count: mocks.attemptCount, create: mocks.attemptCreate, update: vi.fn() },
    tempoReceivable: { findUnique: mocks.tempoReceivableFind, update: mocks.tempoReceivableUpdate, updateMany: mocks.tempoReceivableUpdateMany },
    tempoPayment: { findUnique: mocks.tempoPaymentFind, create: mocks.tempoPaymentCreate, update: mocks.tempoPaymentUpdate, updateMany: vi.fn() },
    tempoPaymentReversal: { upsert: mocks.tempoPaymentReversalUpsert },
    auditLog: { create: mocks.auditLogCreate },
    integrationCustomerMapping: { findUnique: mocks.customerMappingFind, upsert: mocks.customerMappingUpsert },
    $transaction: vi.fn(async (input: unknown) => typeof input === "function" ? await (input as (client: typeof tx) => unknown)(tx) : await Promise.all(input as Promise<unknown>[]))
  } };
});

vi.mock("@/lib/integrations/mj/erp", () => ({
  createMjErpCustomer: mocks.createCustomer,
  createMjErpInvoice: mocks.createInvoice,
  releaseMjStock: mocks.releaseStock,
  createMjPayment: mocks.createPayment,
  cancelMjErpSales: mocks.cancelErpSales,
  deterministicReference: (kind: string, external: string, suffix = "") => `${kind}-${external}-${suffix}`
}));

import { cancelMjInvoice, createOrResumeMjInvoice, recordMjPrintEvent, recordMjTempoPayment } from "@/lib/integrations/mj/service";

const principal = { clientId: "client-1", clientCode: "mj-sandbox", environment: "sandbox", tokenId: "token-1" };
const base = {
  source: "MJ" as const, external_reference: "INV-MJ-1", invoice_reference: "INV-MJ-1", invoice_date: "2026-08-11", currency: "IDR" as const,
  bookkeeping_type_code: "SLM", customer: { mode: "manual" as const, external_id: "C-1", name: "Toko", address: "Jakarta" },
  payment: { method: "Cash" as const, status: "paid" as const, paid_amount: 100_000 }, subtotal: 100_000, discount: 0, total: 100_000
};

function row(mode: "slm_process_aj" | "aj_already_processed" | "record_only", overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1", saleDate: new Date("2026-08-11T00:00:00Z"), transactionNumber: "INV-MJ-1", total: 100_000,
    initialPaymentAmount: 0, paymentMethod: "Cash", customerName: "Toko", externalCustomerId: "C-1", erpCustomerId: mode === "aj_already_processed" ? 25 : null,
    erpInvoiceId: mode === "aj_already_processed" ? 44 : null, erpInvoiceNumber: mode === "aj_already_processed" ? "INV-MJ-1" : null,
    source: "MJ", externalReference: "INV-MJ-1", integrationProcessingMode: mode, integrationPayloadHash: "hash",
    integrationMetadata: {}, integrationAttempts: [], items: [], approvalStatus: "approved", tipeId: "SLM",
    customerSyncStatus: mode === "record_only" ? "not_required" : "externally_processed", syncStatus: mode === "record_only" ? "not_required" : "externally_processed",
    stockReleaseStatus: mode === "record_only" ? "not_required" : "externally_processed", erpPaymentStatus: "not_required",
    ...overrides
  } as never;
}

describe("MJ processing mode orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tipeFind.mockResolvedValue({ id: "SLM", code: "SLM", name: "SLM", isActive: true });
    mocks.salesCreate.mockResolvedValue({});
  });

  it.each([
    ["aj_already_processed", {
      ...base, processing_mode: "aj_already_processed" as const, aj_invoice_number: "INV-MJ-1", aj_invoice_id: "44", aj_customer_id: "25",
      payment: { ...base.payment, account: { mode: "manual" as const, aj_coa_reference: "1112.01" } },
      items: [{ external_product_id: "10", warehouse_id: "1", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }]
    }],
    ["record_only", {
      ...base, processing_mode: "record_only" as const,
      payment: { ...base.payment, account: { mode: "manual" as const, account_reference: "CASH-MJ", name: "Kas MJ" } },
      items: [{ product_reference: "SKU-MJ", product_name: "Produk Lokal", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }]
    }]
  ])("creates %s without any AJ call", async (mode, payload) => {
    const saved = row(mode as "aj_already_processed" | "record_only", { integrationPayloadHash: immutablePayloadHash(payload) });
    mocks.salesFind.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);

    await expect(createOrResumeMjInvoice(payload, principal)).resolves.toMatchObject({ status: "created" });
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.createInvoice).not.toHaveBeenCalled();
    expect(mocks.releaseStock).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.salesCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ integrationProcessingMode: mode }) }));
    const createData = mocks.salesCreate.mock.calls[0][0].data;
    if (mode === "record_only") {
      expect(createData).toMatchObject({ syncTarget: "local", customerSyncStatus: "not_required", syncStatus: "not_required", stockReleaseStatus: "not_required", erpPaymentStatus: "not_required" });
      expect(createData.items.create[0]).toMatchObject({ productRef: "SKU-MJ", productId: null, warehouseId: null });
    } else {
      expect(createData).toMatchObject({ syncTarget: "erp", customerSyncStatus: "externally_processed", syncStatus: "externally_processed", stockReleaseStatus: "externally_processed", erpPaymentStatus: "externally_processed", erpInvoiceId: 44, erpInvoiceNumber: "INV-MJ-1", erpCustomerId: 25 });
    }
  });

  it("persists exact transactionAt when transaction_at is provided in payload", async () => {
    const customTime = "2026-08-11T14:35:22.000Z";
    const payload = {
      ...base,
      transaction_at: customTime,
      processing_mode: "record_only" as const,
      payment: { ...base.payment, account: { mode: "manual" as const, account_reference: "CASH-MJ", name: "Kas MJ" } },
      items: [{ product_reference: "SKU-MJ", product_name: "Produk Lokal", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }]
    };
    const saved = row("record_only", { integrationPayloadHash: immutablePayloadHash(payload) });
    mocks.salesFind.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);

    await expect(createOrResumeMjInvoice(payload, principal)).resolves.toMatchObject({ status: "created" });
    const createData = mocks.salesCreate.mock.calls[0][0].data;
    expect(createData.transactionAt).toEqual(new Date(customTime));
  });

  it("records Tempo payment locally for record_only without AJ payment", async () => {
    const invoice = row("record_only", { paymentMethod: "Tempo", total: 100_000 });
    mocks.tempoReceivableFind.mockResolvedValue({ id: "tempo-1", salesId: "sale-1", paidAmount: 0, remainingAmount: 100_000, originalAmount: 100_000, status: "open" });
    mocks.tempoPaymentFind.mockResolvedValue(null);
    mocks.tempoPaymentCreate.mockResolvedValue({});
    mocks.tempoPaymentUpdate.mockResolvedValue({});
    mocks.tempoReceivableUpdate.mockResolvedValue({ paidAmount: 25_000, remainingAmount: 75_000 });
    mocks.rekeningFind.mockResolvedValue({ id: "cash", name: "Kas", erpCoaId: null });
    mocks.salesFind.mockResolvedValue(invoice);

    await expect(recordMjTempoPayment(invoice, { payment_reference: "PAY-1", payment_date: "2026-08-12", amount: 25_000, payment_method: "Cash", account: { mode: "slm", rekening_id: "cash" } })).resolves.toMatchObject({ status: "created", remaining_amount: 75_000 });
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.tempoPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ erpPaymentStatus: "not_required" }) }));
  });

  it("keeps the staged AJ orchestration for slm_process_aj", async () => {
    const payload = {
      ...base, processing_mode: "slm_process_aj" as const,
      payment: { method: "Tempo" as const, status: "unpaid" as const, paid_amount: 0, due_date: "2026-09-11" },
      items: [{ external_product_id: "10", warehouse_id: "1", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }]
    };
    const pending = row("slm_process_aj", { integrationPayloadHash: immutablePayloadHash(payload), customerSyncStatus: "pending", syncStatus: "pending", stockReleaseStatus: "pending" });
    const customerDone = row("slm_process_aj", { integrationPayloadHash: immutablePayloadHash(payload), customerSyncStatus: "synced", erpCustomerId: 25, syncStatus: "pending", stockReleaseStatus: "pending" });
    const invoiceDone = row("slm_process_aj", { integrationPayloadHash: immutablePayloadHash(payload), customerSyncStatus: "synced", erpCustomerId: 25, syncStatus: "synced", erpReference: "MJ-INVOICE-1", erpInvoiceId: 44, erpInvoiceNumber: "INV-MJ-1", stockReleaseStatus: "pending" });
    const released = row("slm_process_aj", { integrationPayloadHash: immutablePayloadHash(payload), customerSyncStatus: "synced", erpCustomerId: 25, syncStatus: "synced", erpReference: "MJ-INVOICE-1", erpInvoiceId: 44, erpInvoiceNumber: "INV-MJ-1", stockReleaseStatus: "released" });
    mocks.salesFind.mockResolvedValue(pending);
    mocks.salesUpdateMany.mockResolvedValue({ count: 1 });
    mocks.attemptCount.mockResolvedValue(0);
    mocks.customerMappingFind.mockResolvedValue(null);
    mocks.createCustomer.mockResolvedValue({ success: true, data: { id: 25, name: "Toko" } });
    mocks.createInvoice.mockResolvedValue({ success: true, data: { erpReference: "MJ-INVOICE-1", invoiceId: 44, invoiceNumber: "INV-MJ-1", raw: {} } });
    mocks.releaseStock.mockResolvedValue({ success: true, data: { releaseReference: "REL-1" } });
    mocks.salesUpdate.mockResolvedValueOnce(customerDone).mockResolvedValueOnce(invoiceDone).mockResolvedValueOnce(released);

    await expect(createOrResumeMjInvoice(payload, principal)).resolves.toMatchObject({ status: "already_processed" });
    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.createInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.releaseStock).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("cancels record_only locally", async () => {
    const local = row("record_only");
    mocks.attemptCount.mockResolvedValue(0);
    mocks.salesUpdate.mockResolvedValue({});
    mocks.tempoReceivableFind.mockResolvedValue(null);
    mocks.salesFind.mockResolvedValue(row("record_only", { approvalStatus: "cancelled" }));

    await expect(cancelMjInvoice(local, "Dibatalkan MJ", principal)).resolves.toMatchObject({ status: "cancelled" });
    expect(mocks.cancelErpSales).not.toHaveBeenCalled();
  });

  it("cancels aj_already_processed locally without calling ERP", async () => {
    const ajProcessed = row("aj_already_processed");
    mocks.attemptCount.mockResolvedValue(0);
    mocks.salesUpdate.mockResolvedValue({});
    mocks.tempoReceivableFind.mockResolvedValue(null);
    mocks.salesFind.mockResolvedValue(row("aj_already_processed", { approvalStatus: "cancelled" }));

    await expect(cancelMjInvoice(ajProcessed, "Dibatalkan MJ", principal)).resolves.toMatchObject({ status: "cancelled" });
    expect(mocks.cancelErpSales).not.toHaveBeenCalled();
  });

  it("calls cancelMjErpSales for synced slm_process_aj invoice and reverses tempo payments", async () => {
    const ajInvoice = row("slm_process_aj", {
      syncStatus: "synced",
      erpInvoiceId: 44,
      erpInvoiceNumber: "INV-MJ-1",
      stockReleaseReference: "REL-1",
      erpPaymentReference: "PAY-1"
    });
    mocks.attemptCount.mockResolvedValue(0);
    mocks.cancelErpSales.mockResolvedValue({
      success: true,
      data: {
        status: "cancelled",
        stockReversalStatus: "reversed",
        paymentReversalStatus: "reversed",
        reversalReference: "REV-REF-1"
      }
    });
    mocks.salesUpdate.mockResolvedValue({});
    mocks.tempoReceivableFind.mockResolvedValue({
      id: "tempo-1",
      salesId: "sale-1",
      status: "open",
      payments: [{ id: "pay-1", amountPaid: 50_000, erpPaymentStatus: "paid" }]
    });
    mocks.tempoReceivableUpdate.mockResolvedValue({});
    mocks.tempoPaymentReversalUpsert.mockResolvedValue({});
    mocks.auditLogCreate.mockResolvedValue({});
    mocks.salesFind.mockResolvedValue(row("slm_process_aj", { approvalStatus: "cancelled", syncStatus: "synced" }));

    const result = await cancelMjInvoice(ajInvoice, "Dibatalkan MJ", principal);
    expect(result).toMatchObject({ status: "cancelled" });
    expect(mocks.cancelErpSales).toHaveBeenCalledWith(expect.objectContaining({
      externalReference: "INV-MJ-1",
      saleId: "sale-1",
      invoiceId: 44,
      invoiceNumber: "INV-MJ-1",
      stockReleaseReference: "REL-1",
      paymentReference: "PAY-1",
      reason: "Dibatalkan MJ"
    }));
    expect(mocks.tempoPaymentReversalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "TPR-CANCEL-pay-1" },
      create: expect.objectContaining({
        tempoPaymentId: "pay-1",
        amount: 50_000,
        reason: "Dibatalkan MJ",
        erpStatus: "reversed"
      })
    }));
  });

  it("returns already_cancelled when invoice is already cancelled", async () => {
    const cancelled = row("slm_process_aj", { approvalStatus: "cancelled" });
    const result = await cancelMjInvoice(cancelled, "Dibatalkan lagi", principal);
    expect(result).toMatchObject({ status: "already_cancelled" });
    expect(mocks.cancelErpSales).not.toHaveBeenCalled();
  });

  it("records print event and updates invoice print metadata and audit log", async () => {
    const invoice = row("slm_process_aj", {
      integrationMetadata: {
        payload: base,
        client_code: "mj-sandbox",
        environment: "sandbox"
      }
    });

    const result = await recordMjPrintEvent(
      invoice,
      {
        printed_at: "2026-08-20T15:30:00.000Z",
        printed_by: "Kasir MJ",
        printer_name: "Epson LX-310",
        format: "dot_matrix"
      },
      principal
    );

    expect(result).toMatchObject({
      status: "recorded",
      is_printed: true,
      print_count: 1,
      printed_at: "2026-08-20T15:30:00.000Z",
      printed_by: "Kasir MJ"
    });

    expect(mocks.salesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1" },
      data: expect.objectContaining({
        integrationMetadata: expect.objectContaining({
          is_printed: true,
          print_count: 1,
          printed_by: "Kasir MJ"
        })
      })
    }));

    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: "sales",
        entityId: "sale-1",
        action: "print",
        userId: "integration:mj-sandbox"
      })
    }));
  });
});
