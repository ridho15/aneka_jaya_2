import { describe, expect, it } from "vitest";
import { immutablePayloadHash } from "@/lib/integrations/mj/hash";
import { mjInvoiceSchema, mjTempoPaymentSchema } from "@/lib/integrations/mj/validation";

const valid = {
  source: "MJ" as const,
  external_reference: "MJ-001",
  invoice_reference: "INV-MJ-001",
  invoice_date: "2026-08-11",
  currency: "IDR" as const,
  bookkeeping_type_code: "SLM",
  customer: { mode: "existing" as const, customer_id: "25", name: "Toko Maju" },
  payment: { method: "TF" as const, status: "paid" as const, paid_amount: 100_000, account: { mode: "slm" as const, rekening_id: "bank-1" } },
  items: [{ external_product_id: "10", warehouse_id: "1", quantity: 2, unit_price: 50_000, discount: 0, subtotal: 100_000 }],
  subtotal: 100_000,
  discount: 0,
  total: 100_000
};

describe("MJ invoice validation and immutable hashing", () => {
  it("accepts a balanced IDR transfer invoice", () => {
    expect(mjInvoiceSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["currency", { ...valid, currency: "USD" }],
    ["line subtotal", { ...valid, items: [{ ...valid.items[0], subtotal: 99_999 }] }],
    ["invoice total", { ...valid, total: 99_999 }],
    ["missing AJ product", { ...valid, items: [{ ...valid.items[0], external_product_id: "SKU-X" }] }],
    ["missing warehouse", { ...valid, items: [{ ...valid.items[0], warehouse_id: "" }] }],
    ["underpaid transfer", { ...valid, payment: { ...valid.payment, paid_amount: 50_000 } }]
  ])("rejects invalid %s", (_label, payload) => {
    expect(mjInvoiceSchema.safeParse(payload).success).toBe(false);
  });

  it("requires due date for Tempo and allows a partial initial payment", () => {
    const invalid = { ...valid, payment: { method: "Tempo" as const, status: "partial" as const, paid_amount: 25_000, account: { mode: "manual" as const, aj_coa_reference: "1112.01" } } };
    expect(mjInvoiceSchema.safeParse(invalid).success).toBe(false);
    expect(mjInvoiceSchema.safeParse({ ...invalid, payment: { ...invalid.payment, due_date: "2026-09-11" } }).success).toBe(true);
  });

  it("validates Tempo payment and manual COA reference", () => {
    expect(mjTempoPaymentSchema.safeParse({ payment_reference: "PAY-1", payment_date: "2026-08-12", amount: 10_000, payment_method: "TF", account: { mode: "manual", aj_coa_reference: "1112.01" } }).success).toBe(true);
  });

  it("produces stable hashes independent of object key order", () => {
    expect(immutablePayloadHash({ b: 2, a: { d: 4, c: 3 } })).toBe(immutablePayloadHash({ a: { c: 3, d: 4 }, b: 2 }));
    expect(immutablePayloadHash(valid)).not.toBe(immutablePayloadHash({ ...valid, total: 99_999 }));
  });
});
