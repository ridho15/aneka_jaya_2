import { describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sales/store", () => ({ getSalesRecord: vi.fn(), listSalesRecordsPage: vi.fn() }));

import { canViewSalesRecord, salesRecordScopeForUser } from "@/lib/sales/access";

const mjSale = { id: "sale-mj", saleDate: "2026-08-11", customerName: "MJ Customer", paymentMethod: "Cash", total: 10_000, items: [], source: "MJ", createdByUserId: "integration:mj" } satisfies Sale;

describe("MJ sales UI access", () => {
  it("allows Owner and rejects every other role", () => {
    expect(canViewSalesRecord({ id: "owner", name: "Owner", role: "OWNER" }, mjSale)).toBe(true);
    expect(canViewSalesRecord({ id: "admin", name: "Admin", role: "ADMIN" }, mjSale)).toBe(false);
    expect(canViewSalesRecord({ id: "manager", name: "Manager", role: "MANAGER" }, mjSale)).toBe(false);
  });

  it("adds a database source filter for non-Owners", () => {
    expect(salesRecordScopeForUser({ id: "owner", name: "Owner", role: "OWNER" })).toBeUndefined();
    expect(salesRecordScopeForUser({ id: "admin", name: "Admin", role: "ADMIN" })).toEqual({ createdByUserId: "admin", excludeSource: "MJ" });
    expect(salesRecordScopeForUser({ id: "manager", name: "Manager", role: "MANAGER" })).toEqual({ excludeSource: "MJ" });
  });
});
