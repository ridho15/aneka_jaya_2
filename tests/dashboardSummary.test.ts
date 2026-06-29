import { describe, expect, it } from "vitest";
import { buildCategorySummary, buildMonthlyPerformance } from "@/lib/dashboard/summary";
import type { AuditLog } from "@/lib/audit/store";
import type { Product } from "@/lib/types/product";
import type { Sale } from "@/lib/types/sales";

const sale: Sale = {
  id: "sale-1",
  saleDate: "2026-06-10",
  customerName: "Pelanggan",
  paymentMethod: "Cash",
  total: 200_000,
  approvalStatus: "approved",
  items: [{ productRef: "SKU-1", quantity: 2, unitPrice: 100_000 }]
};

const expenseAudit: AuditLog = {
  id: "audit-1",
  entityType: "expense",
  entityId: "expense-1",
  action: "create",
  afterValue: { expenseDate: "2026-06-11", amount: 50_000 },
  userId: "owner",
  userNameSnapshot: "Admin",
  userRoleSnapshot: "OWNER",
  createdAt: "2026-06-11T08:00:00.000Z"
};

describe("dashboard summaries", () => {
  it("aggregates real approved sales and audited expenses by month", () => {
    const result = buildMonthlyPerformance([sale], [expenseAudit], new Date("2026-06-29T00:00:00.000Z"));
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ key: "2026-06", sales: 200_000, expenses: 50_000 });
  });

  it("returns zeroes instead of fabricated values when transactions are empty", () => {
    expect(buildMonthlyPerformance([], [], new Date("2026-06-29T00:00:00.000Z")).every((row) => row.sales === 0 && row.expenses === 0)).toBe(true);
    expect(buildCategorySummary([], [])).toEqual([]);
  });

  it("derives category distribution from ERP product references", () => {
    const products = [{ id: "1", code: "SKU-1", name: "Produk", category: "Utama" }] as Product[];
    expect(buildCategorySummary([sale], products)).toEqual([
      { label: "Utama", value: 200_000, percentage: 100 }
    ]);
  });
});
