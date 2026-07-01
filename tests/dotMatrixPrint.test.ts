import { describe, expect, it } from "vitest";
import {
  DOT_MATRIX_WIDTH,
  column,
  formatExpenseDotMatrix,
  formatSaleDotMatrix,
  formatTempoPaymentDotMatrix,
  signatureBlock,
  summaryLine,
  toEscPosPrn,
  twoColumn
} from "@/lib/print/dotMatrix";

const expectFixedWidth = (text: string) => {
  for (const line of text.trimEnd().split("\n")) {
    expect(line.length).toBeLessThanOrEqual(DOT_MATRIX_WIDTH);
  }
};

describe("dot matrix print formatter", () => {
  it("uses 44 columns for the active small dot matrix standard", () => {
    expect(DOT_MATRIX_WIDTH).toBe(44);
  });

  it("keeps fixed-width layout helpers inside 44 columns", () => {
    expect(column("ABCDEFGHIJ", 5)).toBe("ABCDE");
    expect(column("A", 3, "right")).toBe("  A");
    expect(twoColumn("LOGO + KIRI", "CUSTOMER KANAN")).toHaveLength(DOT_MATRIX_WIDTH);
    expect(summaryLine("TOTAL", "Rp 63.270 jt")).toHaveLength(DOT_MATRIX_WIDTH);
    expect(signatureBlock("Ridho Al Amzah").every((line) => line.length <= DOT_MATRIX_WIDTH)).toBe(true);
    expect(signatureBlock("Ridho Al Amzah").join("\n")).toContain("_".repeat(24));
  });

  it("formats a tempo sale within 44 columns", () => {
    const text = formatSaleDotMatrix({
      id: "S-TEST-001",
      saleDate: "2026-06-27",
      customerName: "Toko Contoh Dengan Nama Sangat Panjang",
      customerLocation: "Jakarta Barat Area Panjang",
      shippingMethod: "di Tempat",
      paymentMethod: "Tempo",
      dueDate: "2026-07-04",
      approvalStatus: "approved",
      total: 300000,
      items: [
        { productRef: "LEM-BULU-MATA-PALING-PANJANG", quantity: 2, unitPrice: 150000, discount: 0 }
      ]
    });

    expectFixedWidth(text);
    expect(text).toContain("INVOICE PENJUALAN");
    expect(text).toContain("Toko Contoh");
    expect(text).toContain("Rp 300.000");
    expect(text).toContain("2026-07-04");
    expect(text).toContain("approved");
    expect(text).toContain("Tanda Tangan:");
  });

  it("uses compact million currency notation like Aneka Jaya ERP", () => {
    const text = formatSaleDotMatrix({
      id: "S-COMPACT",
      saleDate: "2026-06-27",
      tipeCodeSnapshot: "AJ",
      customerName: "Toko Compact",
      paymentMethod: "Cash",
      total: 63_270_000,
      items: [
        { productRef: "ITEM-950", quantity: 1, unitPrice: 950_000, discount: 0 },
        { productRef: "ITEM-1JT", quantity: 1, unitPrice: 1_000_000, discount: 0 },
        { productRef: "ITEM-1234", quantity: 1, unitPrice: 1_234_000, discount: 0 }
      ]
    });

    expectFixedWidth(text);
    expect(text).toContain("Rp 950.000");
    expect(text).toContain("Rp 1.000 jt");
    expect(text).toContain("Rp 1.234 jt");
    expect(text).toContain("Rp 63.270 jt");
  });

  it("uses Aneka Jaya header for AJ sales and SLM for non-AJ sales", () => {
    const aj = formatSaleDotMatrix({
      id: "S-AJ",
      saleDate: "2026-06-27",
      tipeCodeSnapshot: "AJ",
      customerName: "Toko AJ",
      paymentMethod: "Cash",
      total: 10000,
      items: []
    });
    const slm = formatSaleDotMatrix({
      id: "S-W",
      saleDate: "2026-06-27",
      tipeCodeSnapshot: "W",
      customerName: "Toko W",
      paymentMethod: "Cash",
      total: 10000,
      items: []
    });

    expect(aj).toContain("ANEKA JAYA");
    expect(slm).toContain("SLM");
  });

  it("can mask sales transaction number for non-owner print access", () => {
    const text = formatSaleDotMatrix({
      id: "S-SECRET-001",
      saleDate: "2026-06-27",
      tipeCodeSnapshot: "W",
      customerName: "Toko Admin",
      paymentMethod: "Cash",
      total: 10000,
      items: []
    }, { showTransactionNumber: false });

    expectFixedWidth(text);
    expect(text).toContain("No -");
    expect(text).not.toContain("S-SECRET-001");
  });

  it("uses Aneka Jaya fixed item positioning without shifting totals", () => {
    const text = formatSaleDotMatrix({
      id: "S-LAYOUT",
      saleDate: "2026-06-27",
      tipeCodeSnapshot: "AJ",
      customerName: "Customer Layout",
      paymentMethod: "Cash",
      total: 1_234_000,
      createdByNameSnapshot: "Admin Cetak",
      items: [
        { productRef: "BRG-001 Nama barang yang panjang sekali", unitSnapshot: "PCS", quantity: 10, unitPrice: 275_000, discount: 0 }
      ]
    });
    const lines = text.trimEnd().split("\n");

    expectFixedWidth(text);
    expect(text).toContain("NO KODE    NAMA PRODUK");
    expect(text).toContain("HARGA");
    expect(text).toContain("TOTAL:");
    expect(text).toContain("Rp 1.234 jt");
    expect(text).toContain("Admin Cetak");
    expect(text).toContain("10 PCS");
    expect(lines.some((line) => line.includes("BRG-001") && line.includes("Nama barang"))).toBe(true);
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
    expect(text).toContain("BAYAR TEMPO");
    expect(text).toContain("Toko Contoh");
    expect(text).toContain("Rp 100.000");
    expect(text).toContain("Rp 200.000");
    expect(text).toContain("BCA Operasional");
    expect(text).toContain("Tanda Tangan:");
  });

  it("formats an expense transaction within 44 columns", () => {
    const text = formatExpenseDotMatrix({
      id: "EXP-1",
      expenseDate: "2026-06-29",
      tipeCodeSnapshot: "W",
      rekeningNameSnapshot: "Kas Operasional",
      coaNameSnapshot: "Kas",
      category: "Operasional",
      vendorName: "Vendor Contoh",
      description: "Beli perlengkapan toko",
      amount: 125000,
      paymentMethod: "Cash",
      approvalStatus: "approved",
      erpSyncStatus: "not_required"
    });

    expectFixedWidth(text);
    expect(text).toContain("PENGELUARAN");
    expect(text).toContain("Vendor Contoh");
    expect(text).toContain("Rp 125.000");
    expect(text).toContain("SLM");
    expect(text).toContain("Tanda Tangan:");
  });

  it("wraps text output as a minimal native ESC/P PRN payload", () => {
    const text = "SLM\nTOTAL\n";
    const prn = toEscPosPrn(text);

    expect(prn.startsWith("\x1B@\x12")).toBe(true);
    expect(prn).toContain(text);
    expect(prn.endsWith("\x0C")).toBe(true);
  });
});
