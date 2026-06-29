import { describe, expect, it } from "vitest";
import { DOT_MATRIX_WIDTH, formatSaleDotMatrix, formatTempoPaymentDotMatrix } from "@/lib/print/dotMatrix";

const expectFixedWidth = (text: string) => {
  for (const line of text.trimEnd().split("\n")) {
    expect(line.length).toBeLessThanOrEqual(DOT_MATRIX_WIDTH);
  }
};

describe("dot matrix print formatter", () => {
  it("formats a tempo sale within 80 columns", () => {
    const text = formatSaleDotMatrix({
      id: "S-TEST-001",
      saleDate: "2026-06-27",
      customerName: "Toko Contoh",
      customerLocation: "Jakarta",
      shippingMethod: "di Tempat",
      paymentMethod: "Tempo",
      dueDate: "2026-07-04",
      approvalStatus: "approved",
      total: 300000,
      items: [
        { productRef: "LEM-BULU-MATA", quantity: 2, unitPrice: 150000, discount: 0 }
      ]
    });

    expectFixedWidth(text);
    expect(text).toContain("Toko Contoh");
    expect(text).toContain("LEM-BULU-MATA");
    expect(text).toContain("Rp 300.000");
    expect(text).toContain("2026-07-04");
    expect(text).toContain("approved");
  });

  it("formats a tempo payment with paid and remaining amount", () => {
    const text = formatTempoPaymentDotMatrix({
      receivable: {
        id: "TMP-1",
        salesId: "S-1",
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "W",
        customerName: "Toko Contoh",
        originalAmount: 300000,
        paidAmount: 100000,
        remainingAmount: 200000,
        transactionDate: "2026-06-27",
        dueDate: "2026-07-04",
        status: "partial_paid",
        createdByUserId: "u-1",
        createdByNameSnapshot: "Finance",
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:00.000Z"
      },
      payments: [
        {
          id: "TPY-1",
          tempoReceivableId: "TMP-1",
          paymentDate: "2026-06-27",
          amountPaid: 100000,
          paymentMethod: "TF",
          rekeningId: "BCA",
          rekeningNameSnapshot: "BCA Operasional",
          createdByUserId: "u-2",
          createdByNameSnapshot: "Finance",
          createdAt: "2026-06-27T00:00:00.000Z"
        }
      ]
    });

    expectFixedWidth(text);
    expect(text).toContain("Toko Contoh");
    expect(text).toContain("Rp 100.000");
    expect(text).toContain("Rp 200.000");
    expect(text).toContain("BCA Operasional");
  });
});
