import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { filterSalesRecordsInMemory } from "@/lib/sales/store";
import type { Sale } from "@/lib/types/sales";

describe("Sales History Filtering Improvements", () => {
  const dummySales: Partial<Sale>[] = [
    {
      id: "S-101",
      transactionNumber: "160926-01",
      customerName: "Sensen",
      customerLocation: "Jakarta",
      saleDate: "2026-08-10",
      total: 1000000,
      approvalStatus: "approved",
      paymentMethod: "TF",
      rekeningId: "rek-123",
      rekeningNameSnapshot: "BCA - SB",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      items: [
        {
          productRef: "Ubr100Glp",
          quantity: 10,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-102",
      transactionNumber: "160926-02",
      customerName: "Riki Solo",
      customerLocation: "Solo",
      saleDate: "2026-08-12",
      total: 2500000,
      approvalStatus: "approved",
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Kas Walk In",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      items: [
        {
          productRef: "AMJ07-2",
          quantity: 20,
          unitPrice: 125000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-103",
      transactionNumber: "160926-03",
      customerName: "Meli Bungsu",
      customerLocation: "Bogor",
      saleDate: "2026-08-15",
      total: 500000,
      approvalStatus: "approved",
      paymentMethod: "TF",
      rekeningId: null as any,
      rekeningNameSnapshot: "BCA",
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      items: [
        {
          productRef: "Stiker AJKP48-14",
          quantity: 10,
          unitPrice: 50000,
          discount: 0,
        },
      ],
    },
  ];

  it("finds sales transaction by searching product name in keyword", () => {
    // Searching product 'AMJ07' should return transaction S-102
    const filtered = filterSalesRecordsInMemory(
      dummySales as Sale[],
      { keyword: "AMJ07" }
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("S-102");
    expect(filtered[0].customerName).toBe("Riki Solo");
  });

  it("finds sales transaction by searching another product 'Ubr100'", () => {
    const filtered = filterSalesRecordsInMemory(
      dummySales as Sale[],
      { keyword: "Ubr100" }
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("S-101");
  });

  it("filters by rekening flexibly using name snapshot or id", () => {
    // Should match S-103 which has rekeningNameSnapshot: 'BCA'
    const filtered = filterSalesRecordsInMemory(
      dummySales as Sale[],
      { rekening: "BCA" }
    );
    // S-101 (BCA - SB) and S-103 (BCA) both match
    expect(filtered.length).toBe(2);
    expect(filtered.map((s) => s.id)).toEqual(["S-101", "S-103"]);
  });

  it("filters by tipe accurately", () => {
    const filtered = filterSalesRecordsInMemory(
      dummySales as Sale[],
      { tipe: "AJ" }
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("S-103");
  });
});
