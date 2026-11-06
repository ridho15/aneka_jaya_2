import { describe, expect, it } from "vitest";
import { immutablePayloadHash } from "@/lib/integrations/mj/hash";
import {
  mjCancelSchema,
  mjInvoiceSchema,
  mjStockAdjustmentSchema,
  mjTempoPaymentSchema
} from "@/lib/integrations/mj/validation";

const common = {
  source: "MJ" as const,
  external_reference: "MJ-001",
  invoice_reference: "INV-MJ-001",
  invoice_date: "2026-08-11",
  currency: "IDR" as const,
  bookkeeping_type_code: "SLM",
  customer: { mode: "existing" as const, customer_id: "25", name: "Toko Maju" },
  payment: { method: "TF" as const, status: "paid" as const, paid_amount: 100_000, account: { mode: "slm" as const, rekening_id: "bank-1" } },
  subtotal: 100_000,
  discount: 0,
  total: 100_000
};

const ajItem = { external_product_id: "10", warehouse_id: "1", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 };
const slmProcessAj = { ...common, processing_mode: "slm_process_aj" as const, items: [ajItem] };
const ajAlreadyProcessed = {
  ...common, processing_mode: "aj_already_processed" as const,
  external_reference: "INV-MJ-001", aj_invoice_number: "INV-MJ-001", aj_invoice_id: "44", aj_customer_id: "25", items: [ajItem]
};
const recordOnly = {
  ...common, processing_mode: "record_only" as const,
  payment: { ...common.payment, account: { mode: "manual" as const, account_reference: "CASH-MJ", name: "Kas MJ" } },
  items: [{ product_reference: "MJ-SKU-1", product_name: "Produk Lokal", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }]
};

describe("MJ processing-mode validation", () => {
  it.each([
    ["slm_process_aj", slmProcessAj],
    ["aj_already_processed", ajAlreadyProcessed],
    ["record_only", recordOnly]
  ])("accepts %s", (_label, payload) => {
    expect(mjInvoiceSchema.safeParse(payload).success).toBe(true);
  });

  it("requires processing_mode explicitly", () => {
    const { processing_mode: _mode, ...withoutMode } = slmProcessAj;
    expect(mjInvoiceSchema.safeParse(withoutMode).success).toBe(false);
  });

  it.each([
    ["currency", { ...slmProcessAj, currency: "USD" }],
    ["line subtotal", { ...slmProcessAj, items: [{ ...ajItem, subtotal: 99_999 }] }],
    ["invoice total", { ...slmProcessAj, total: 99_999 }],
    ["missing AJ product", { ...slmProcessAj, items: [{ ...ajItem, external_product_id: "SKU-X" }] }],
    ["missing warehouse", { ...slmProcessAj, items: [{ ...ajItem, warehouse_id: "" }] }],
    ["underpaid transfer", { ...slmProcessAj, payment: { ...slmProcessAj.payment, paid_amount: 50_000 } }]
  ])("rejects invalid %s", (_label, payload) => {
    expect(mjInvoiceSchema.safeParse(payload).success).toBe(false);
  });

  it("enforces identical MJ and AJ references for aj_already_processed", () => {
    expect(mjInvoiceSchema.safeParse({ ...ajAlreadyProcessed, external_reference: "DIFFERENT" }).success).toBe(false);
    expect(mjInvoiceSchema.safeParse({ ...ajAlreadyProcessed, aj_invoice_number: "DIFFERENT" }).success).toBe(false);
    const { aj_customer_id: _customer, ...withoutCustomer } = ajAlreadyProcessed;
    expect(mjInvoiceSchema.safeParse(withoutCustomer).success).toBe(false);
  });

  it("allows record_only without any AJ item or location IDs", () => {
    expect(mjInvoiceSchema.safeParse(recordOnly).success).toBe(true);
    expect(mjInvoiceSchema.safeParse({ ...recordOnly, items: [{ ...recordOnly.items[0], product_name: "" }] }).success).toBe(false);
  });

  it("accepts a stock_release_reference only on record_only", () => {
    expect(mjInvoiceSchema.safeParse({ ...recordOnly, stock_release_reference: "MJ-STOCK-S-1" }).success).toBe(true);
    expect(mjInvoiceSchema.safeParse({ ...recordOnly, stock_release_reference: "" }).success).toBe(false);
    expect(mjInvoiceSchema.safeParse({ ...slmProcessAj, stock_release_reference: "MJ-STOCK-S-1" }).success).toBe(false);
  });

  it("requires due date for Tempo and allows a partial initial payment", () => {
    const invalid = { ...slmProcessAj, payment: { method: "Tempo" as const, status: "partial" as const, paid_amount: 25_000, account: { mode: "manual" as const, aj_coa_reference: "1112.01" } } };
    expect(mjInvoiceSchema.safeParse(invalid).success).toBe(false);
    expect(mjInvoiceSchema.safeParse({ ...invalid, payment: { ...invalid.payment, due_date: "2026-09-11" } }).success).toBe(true);
  });

  it("accepts AJ and local accounts for Tempo payments", () => {
    const base = { payment_reference: "PAY-1", payment_date: "2026-08-12", amount: 10_000, payment_method: "TF" as const };
    expect(mjTempoPaymentSchema.safeParse({ ...base, account: { mode: "manual", aj_coa_reference: "1112.01" } }).success).toBe(true);
    expect(mjTempoPaymentSchema.safeParse({ ...base, account: { mode: "manual", account_reference: "CASH-MJ", name: "Kas MJ" } }).success).toBe(true);
  });

  it("validates cancel reason", () => {
    expect(mjCancelSchema.safeParse({ reason: "Dibatalkan MJ" }).success).toBe(true);
    expect(mjCancelSchema.safeParse({ reason: "x" }).success).toBe(false);
  });

  it("validates transaction_at datetime when provided", () => {
    expect(mjInvoiceSchema.safeParse({ ...slmProcessAj, transaction_at: "2026-08-11T14:30:00.000Z" }).success).toBe(true);
    expect(mjInvoiceSchema.safeParse({ ...slmProcessAj, transaction_at: "2026-08-11T14:30:00+07:00" }).success).toBe(true);
    expect(mjInvoiceSchema.safeParse({ ...recordOnly, transaction_at: "2026-08-11T07:15:22Z" }).success).toBe(true);
    expect(mjInvoiceSchema.safeParse({ ...slmProcessAj, transaction_at: "invalid-time" }).success).toBe(false);
  });

  it("includes processing mode in immutable hashing", () => {
    expect(immutablePayloadHash({ b: 2, a: { d: 4, c: 3 } })).toBe(immutablePayloadHash({ a: { c: 3, d: 4 }, b: 2 }));
    expect(immutablePayloadHash(slmProcessAj)).not.toBe(immutablePayloadHash({ ...slmProcessAj, processing_mode: "record_only" }));
  });
});

describe("MJ stock adjustment validation", () => {
  const validAdjustment = {
    location_id: "loc-01",
    reason: "Penyesuaian stok berkala",
    items: [
      { product_id: "prod-1", quantity: 5, unit_cost: 15000, notes: "Koreksi fisik" }
    ]
  };

  it("accepts valid adjustment with snake_case and camelCase fields", () => {
    expect(mjStockAdjustmentSchema.safeParse(validAdjustment).success).toBe(true);

    const camelCase = {
      locationId: "loc-01",
      reason: "Penyesuaian camel case",
      adjustmentNumber: "ADJ-001",
      adjustmentDate: "2026-11-06",
      idempotencyKey: "idem-1",
      items: [
        { productId: "prod-1", quantity: -2, unitCost: 10000, notes: "Barang rusak" }
      ]
    };
    expect(mjStockAdjustmentSchema.safeParse(camelCase).success).toBe(true);
  });

  it("accepts warehouse_id as string or number and external_product_id or sku", () => {
    const withWarehouse = {
      warehouse_id: 12,
      reason: "Penyesuaian dari ERP",
      items: [
        { sku: "BRG-01", quantity: 10 },
        { external_product_id: 99, quantity: -1 }
      ]
    };
    expect(mjStockAdjustmentSchema.safeParse(withWarehouse).success).toBe(true);
  });

  it("rejects payload without location", () => {
    const { location_id: _loc, ...withoutLocation } = validAdjustment;
    expect(mjStockAdjustmentSchema.safeParse(withoutLocation).success).toBe(false);
  });

  it("rejects reason shorter than 3 characters or missing", () => {
    expect(mjStockAdjustmentSchema.safeParse({ ...validAdjustment, reason: "ab" }).success).toBe(false);
    expect(mjStockAdjustmentSchema.safeParse({ ...validAdjustment, reason: "" }).success).toBe(false);
  });

  it("rejects zero quantity and empty items", () => {
    expect(mjStockAdjustmentSchema.safeParse({ ...validAdjustment, items: [] }).success).toBe(false);
    expect(mjStockAdjustmentSchema.safeParse({
      ...validAdjustment,
      items: [{ product_id: "prod-1", quantity: 0 }]
    }).success).toBe(false);
  });

  it("rejects item without any product identifier", () => {
    expect(mjStockAdjustmentSchema.safeParse({
      ...validAdjustment,
      items: [{ quantity: 5 }]
    }).success).toBe(false);
  });
});
