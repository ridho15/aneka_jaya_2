import { describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sales/store", () => ({ getSalesRecord: vi.fn(), listSalesRecordsPage: vi.fn() }));

import { canViewSalesRecord, salesRecordScopeForUser } from "@/lib/sales/access";

const mjSale = {
  id: "sale-mj",
  saleDate: "2026-08-11",
  customerName: "MJ Customer",
  paymentMethod: "Cash",
  total: 10_000,
  items: [],
  source: "MJ",
  createdByUserId: "integration:mj",
} satisfies Sale;

describe("MJ sales UI access", () => {
  it("allows Owner and Admin to view MJ sales, rejects unauthorized roles", () => {
    expect(canViewSalesRecord({ id: "owner", name: "Owner", role: "OWNER" }, mjSale)).toBe(true);
    expect(canViewSalesRecord({ id: "admin", name: "Admin", role: "ADMIN" }, mjSale)).toBe(true);
    expect(canViewSalesRecord({ id: "manager", name: "Manager", role: "MANAGER" }, mjSale)).toBe(false);
  });

  it("includes MJ source in sales record scope for Admin", () => {
    expect(salesRecordScopeForUser({ id: "owner", name: "Owner", role: "OWNER" })).toBeUndefined();
    expect(salesRecordScopeForUser({ id: "admin", name: "Admin", role: "ADMIN" })).toEqual({
      createdByUserId: "admin",
      includeSources: ["MJ"],
    });
  });
});
