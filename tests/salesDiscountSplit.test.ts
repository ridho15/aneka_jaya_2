import { describe, expect, it } from "vitest";
import { allocateOrderDiscount } from "@/components/forms/PenjualanForm";
import { salePaymentParts, isPaidPaymentMethod } from "@/lib/sales/payments";

describe("order discount allocation", () => {
  it("spreads the order discount by item value and keeps the exact total", () => {
    const shares = allocateOrderDiscount([100_000, 50_000, 50_000], 10_001);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10_001);
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });
  it("never discounts more than the items are worth", () => {
    expect(allocateOrderDiscount([1_000], 5_000)).toEqual([1_000]);
    expect(allocateOrderDiscount([0, 0], 5_000)).toEqual([0, 0]);
  });
});

describe("split payments", () => {
  it("splits a Split sale into Cash and TF parts", () => {
    const parts = salePaymentParts({ paymentMethod: "Split", total: 300_000, paymentSplits: [
      { method: "Cash", amount: 100_000, rekeningId: "cash-w" },
      { method: "TF", amount: 200_000, rekeningId: "bca" }
    ] });
    expect(parts.map((p) => [p.method, p.amount, p.rekeningId])).toEqual([["Cash", 100_000, "cash-w"], ["TF", 200_000, "bca"]]);
  });
  it("keeps single-method sales as one part and ignores tempo", () => {
    expect(salePaymentParts({ paymentMethod: "TF", total: 50_000, rekeningId: "bca" })).toEqual([{ method: "TF", amount: 50_000, rekeningId: "bca", rekeningNameSnapshot: undefined, transferAccount: undefined }]);
    expect(salePaymentParts({ paymentMethod: "Tempo", total: 50_000 })).toEqual([]);
    expect(isPaidPaymentMethod("Split")).toBe(true);
  });
});
