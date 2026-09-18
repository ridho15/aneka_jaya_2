import { describe, expect, it } from "vitest";
import { penjualanSchema } from "@/lib/validation/penjualanSchema";

const baseInput = {
  saleDate: "2026-07-02",
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  customerName: "Walk In",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  items: [{ productRef: "P-1", quantity: 1, unitPrice: 10000, discount: 0 }]
};

describe("penjualanSchema payment rekening validation", () => {
  it("allows Cash without rekening so the backend can default to Kas Walk In", () => {
    expect(penjualanSchema.safeParse({ ...baseInput, paymentMethod: "Cash" }).success).toBe(true);
  });

  it("still requires a rekening for TF", () => {
    const result = penjualanSchema.safeParse({ ...baseInput, paymentMethod: "TF" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rekeningId).toContain("Pilih rekening penerima untuk TF");
    }
  });

  it("accepts a Jakarta delivery time equal to or after the transaction time", () => {
    expect(penjualanSchema.safeParse({ ...baseInput, paymentMethod: "Cash", transactionAt: "2026-07-02T23:55", deliveryAt: "2026-07-03T00:05" }).success).toBe(true);
  });

  it("rejects a delivery time before the transaction time", () => {
    const result = penjualanSchema.safeParse({ ...baseInput, paymentMethod: "Cash", transactionAt: "2026-07-02T10:00", deliveryAt: "2026-07-02T09:59" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.deliveryAt).toContain("Tanggal dan jam kirim tidak boleh sebelum waktu transaksi");
  });

  it("keeps delivery time optional", () => {
    expect(penjualanSchema.safeParse({ ...baseInput, paymentMethod: "Cash", transactionAt: "2026-07-02T10:00", deliveryAt: "" }).success).toBe(true);
  });

  it("accepts a partial initial payment for Tempo", () => {
    expect(penjualanSchema.safeParse({ ...baseInput, customerName: "Budi", paymentMethod: "Tempo", dueDate: "2026-08-02", initialPaymentAmount: 2_500, initialPaymentMethod: "TF", initialPaymentRekeningId: "bca" }).success).toBe(true);
  });

  it("rejects an initial Tempo payment equal to or above the invoice total", () => {
    const result = penjualanSchema.safeParse({ ...baseInput, customerName: "Budi", paymentMethod: "Tempo", dueDate: "2026-08-02", initialPaymentAmount: 10_000, initialPaymentMethod: "Cash", initialPaymentRekeningId: "cash-w" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.initialPaymentAmount?.[0]).toContain("harus lebih kecil dari total");
  });

  it("requires method and rekening when Tempo has an initial payment", () => {
    const result = penjualanSchema.safeParse({ ...baseInput, customerName: "Budi", paymentMethod: "Tempo", dueDate: "2026-08-02", initialPaymentAmount: 2_500 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.initialPaymentMethod).toBeTruthy();
      expect(result.error.flatten().fieldErrors.initialPaymentRekeningId).toBeTruthy();
    }
  });

  it("rejects an initial payment for non-Tempo transactions", () => {
    expect(penjualanSchema.safeParse({ ...baseInput, paymentMethod: "Cash", initialPaymentAmount: 1_000 }).success).toBe(false);
  });

  it("accepts and trims optional customerPhone", () => {
    const result = penjualanSchema.safeParse({
      ...baseInput,
      paymentMethod: "Cash",
      customerPhone: "  081234567890  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerPhone).toBe("081234567890");
    }
  });

  it("rejects customerPhone that exceeds 25 characters", () => {
    const result = penjualanSchema.safeParse({
      ...baseInput,
      paymentMethod: "Cash",
      customerPhone: "0812345678901234567890123456",
    });
    expect(result.success).toBe(false);
  });
});

