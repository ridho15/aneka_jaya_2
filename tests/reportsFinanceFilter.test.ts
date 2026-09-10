import { describe, expect, it } from "vitest";
import {
  filterApprovedExpenses,
  filterOpenTempo,
  pageHref,
  paginateItems,
  resetExpenseFilterHref,
  resetTempoFilterHref,
  toPage,
  valueOf,
} from "@/lib/reports/financeFilters";
import type { Expense, TempoReceivable } from "@/lib/types/reports";

const sampleTempo: TempoReceivable[] = [
  {
    id: "TMP-1",
    salesId: "SLS-101",
    customerName: "Toko Sinar Abadi",
    tipeCodeSnapshot: "W",
    status: "open",
    dueDate: "2026-09-15",
    totalAmount: 1_000_000,
    amountPaid: 0,
    remainingAmount: 1_000_000,
    createdAt: "2026-09-01T08:00:00.000Z",
  },
  {
    id: "TMP-2",
    salesId: "SLS-102",
    customerName: "UD Berkah Jaya",
    tipeCodeSnapshot: "SLM",
    status: "overdue",
    dueDate: "2026-09-05",
    totalAmount: 2_500_000,
    amountPaid: 500_000,
    remainingAmount: 2_000_000,
    createdAt: "2026-08-20T08:00:00.000Z",
  },
  {
    id: "TMP-3",
    salesId: "SLS-103",
    customerName: "CV Maju Lancar",
    tipeCodeSnapshot: "AJ",
    status: "partial_paid",
    dueDate: "2026-09-20",
    totalAmount: 3_000_000,
    amountPaid: 1_500_000,
    remainingAmount: 1_500_000,
    createdAt: "2026-09-02T08:00:00.000Z",
  },
  {
    id: "TMP-4",
    salesId: "SLS-104",
    customerName: "Toko Sinar Terang",
    tipeCodeSnapshot: "W",
    status: "overdue",
    dueDate: "2026-09-02",
    totalAmount: 800_000,
    amountPaid: 0,
    remainingAmount: 800_000,
    createdAt: "2026-08-15T08:00:00.000Z",
  },
];

const sampleExpenses: Expense[] = [
  {
    id: "EXP-1",
    expenseDate: "2026-09-02",
    tipeCodeSnapshot: "W",
    rekeningId: "rek-1",
    rekeningNameSnapshot: "Kas Walk In",
    category: "Operasional",
    vendorName: "PLN Listrik",
    note: "Listrik gudang September",
    amount: 500_000,
    approvalStatus: "approved",
    createdAt: "2026-09-02T09:00:00.000Z",
  },
  {
    id: "EXP-2",
    expenseDate: "2026-09-03",
    tipeCodeSnapshot: "SLM",
    rekeningId: "rek-2",
    rekeningNameSnapshot: "BCA Operasional",
    category: "Logistik",
    vendorName: "Ekspedisi JNE",
    note: "Kirim barang ke Surabaya",
    amount: 250_000,
    approvalStatus: "approved",
    createdAt: "2026-09-03T10:00:00.000Z",
  },
  {
    id: "EXP-3",
    expenseDate: "2026-09-04",
    tipeCodeSnapshot: "AJ",
    rekeningId: "rek-2",
    rekeningNameSnapshot: "BCA Operasional",
    category: "Operasional",
    vendorName: "PDAM Air Bersih",
    note: "Tagihan air kantor",
    amount: 150_000,
    approvalStatus: "approved",
    createdAt: "2026-09-04T11:00:00.000Z",
  },
];

describe("Laporan Finance Filters & Pagination", () => {
  describe("filterOpenTempo", () => {
    it("returns all items when criteria is empty", () => {
      const result = filterOpenTempo(sampleTempo, {});
      expect(result).toHaveLength(4);
    });

    it("filters by customer name keyword case-insensitively", () => {
      const result = filterOpenTempo(sampleTempo, { keyword: "sinar" });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(["TMP-1", "TMP-4"]);
    });

    it("filters by salesId keyword", () => {
      const result = filterOpenTempo(sampleTempo, { keyword: "SLS-103" });
      expect(result).toHaveLength(1);
      expect(result[0].customerName).toBe("CV Maju Lancar");
    });

    it("filters by tipe", () => {
      const result = filterOpenTempo(sampleTempo, { tipe: "W" });
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.tipeCodeSnapshot === "W")).toBe(true);
    });

    it("filters by status", () => {
      const result = filterOpenTempo(sampleTempo, { status: "overdue" });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(["TMP-2", "TMP-4"]);
    });

    it("combines keyword, tipe, and status filters", () => {
      const result = filterOpenTempo(sampleTempo, {
        keyword: "sinar",
        tipe: "W",
        status: "overdue",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("TMP-4");
    });
  });

  describe("filterApprovedExpenses", () => {
    it("returns all expenses when criteria is empty", () => {
      const result = filterApprovedExpenses(sampleExpenses, {});
      expect(result).toHaveLength(3);
    });

    it("filters by vendor name keyword", () => {
      const result = filterApprovedExpenses(sampleExpenses, { keyword: "pln" });
      expect(result).toHaveLength(1);
      expect(result[0].vendorName).toBe("PLN Listrik");
    });

    it("filters by category keyword", () => {
      const result = filterApprovedExpenses(sampleExpenses, { keyword: "logistik" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("EXP-2");
    });

    it("filters by note keyword", () => {
      const result = filterApprovedExpenses(sampleExpenses, { keyword: "Surabaya" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("EXP-2");
    });

    it("filters by tipe", () => {
      const result = filterApprovedExpenses(sampleExpenses, { tipe: "AJ" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("EXP-3");
    });

    it("filters by rekening name snapshot", () => {
      const result = filterApprovedExpenses(sampleExpenses, {
        rekening: "BCA Operasional",
      });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(["EXP-2", "EXP-3"]);
    });
  });

  describe("paginateItems", () => {
    const list = Array.from({ length: 25 }, (_, i) => `item-${i + 1}`);

    it("paginates page 1 with pageSize 10", () => {
      const result = paginateItems(list, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.items[0]).toBe("item-1");
      expect(result.items[9]).toBe("item-10");
      expect(result.totalPages).toBe(3);
      expect(result.currentPage).toBe(1);
      expect(result.totalItems).toBe(25);
    });

    it("paginates page 3 with remainder items", () => {
      const result = paginateItems(list, 3, 10);
      expect(result.items).toHaveLength(5);
      expect(result.items[0]).toBe("item-21");
      expect(result.items[4]).toBe("item-25");
      expect(result.currentPage).toBe(3);
    });

    it("clamps page when requested page exceeds totalPages", () => {
      const result = paginateItems(list, 99, 10);
      expect(result.currentPage).toBe(3);
      expect(result.items).toHaveLength(5);
    });

    it("handles empty items properly", () => {
      const result = paginateItems([], 1, 10);
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(1);
      expect(result.currentPage).toBe(1);
      expect(result.totalItems).toBe(0);
    });
  });

  describe("URL parameter helpers", () => {
    it("valueOf extracts single value or first array value", () => {
      expect(valueOf({ a: "foo" }, "a")).toBe("foo");
      expect(valueOf({ a: ["bar", "baz"] }, "a")).toBe("bar");
      expect(valueOf({}, "missing")).toBeUndefined();
    });

    it("toPage parses valid page numbers with fallback to 1", () => {
      expect(toPage("3")).toBe(3);
      expect(toPage("0")).toBe(1);
      expect(toPage("-5")).toBe(1);
      expect(toPage("invalid")).toBe(1);
      expect(toPage(undefined)).toBe(1);
    });

    it("pageHref updates target page while retaining other params", () => {
      const params = {
        month: "2026-09",
        tempoKeyword: "budi",
        expensePage: "2",
      };
      const href = pageHref(params, "tempoPage", 3);
      expect(href).toContain("month=2026-09");
      expect(href).toContain("tempoKeyword=budi");
      expect(href).toContain("expensePage=2");
      expect(href).toContain("tempoPage=3");
    });

    it("resetTempoFilterHref removes tempo filters while keeping month and expense params", () => {
      const params = {
        month: "2026-09",
        tempoKeyword: "budi",
        tempoTipe: "W",
        tempoStatus: "overdue",
        tempoPage: "2",
        expenseKeyword: "listrik",
        expensePage: "3",
      };
      const href = resetTempoFilterHref(params);
      expect(href).toContain("month=2026-09");
      expect(href).toContain("expenseKeyword=listrik");
      expect(href).toContain("expensePage=3");
      expect(href).not.toContain("tempoKeyword");
      expect(href).not.toContain("tempoTipe");
      expect(href).not.toContain("tempoStatus");
      expect(href).not.toContain("tempoPage");
    });

    it("resetExpenseFilterHref removes expense filters while keeping tempo params", () => {
      const params = {
        month: "2026-09",
        tempoKeyword: "budi",
        expenseKeyword: "listrik",
        expenseTipe: "SLM",
        expenseRekening: "BCA",
        expensePage: "3",
      };
      const href = resetExpenseFilterHref(params);
      expect(href).toContain("month=2026-09");
      expect(href).toContain("tempoKeyword=budi");
      expect(href).not.toContain("expenseKeyword");
      expect(href).not.toContain("expenseTipe");
      expect(href).not.toContain("expenseRekening");
      expect(href).not.toContain("expensePage");
    });
  });
});
