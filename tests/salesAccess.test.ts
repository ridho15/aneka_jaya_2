import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSalesRecord: vi.fn(),
  listSalesRecordsPage: vi.fn(),
}));

vi.mock("@/lib/sales/store", () => ({
  getSalesRecord: mocks.getSalesRecord,
  listSalesRecordsPage: mocks.listSalesRecordsPage,
}));

import {
  canViewSalesRecord,
  getSalesRecordForUser,
  listSalesRecordsPageForUser,
  salesRecordScopeForUser,
} from "@/lib/sales/access";

const sale: Sale = {
  id: "S-1",
  saleDate: "2026-08-08",
  customerName: "Pelanggan",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Cash",
  total: 10000,
  items: [],
  createdByUserId: "admin-1",
  createdByNameSnapshot: "Admin Satu",
  createdByRoleSnapshot: "ADMIN" as const,
};

describe("sales record access", () => {
  beforeEach(() => {
    mocks.getSalesRecord.mockReset();
    mocks.listSalesRecordsPage.mockReset();
  });

  it("scopes Admin lists to the authenticated identity without scoping Owner", () => {
    expect(salesRecordScopeForUser({ id: "admin-1", name: "Admin", role: "ADMIN" })).toEqual({ createdByUserId: "admin-1", excludeSource: "MJ" });
    expect(salesRecordScopeForUser({ id: "owner-1", name: "Owner", role: "OWNER" })).toBeUndefined();
  });

  it("allows Admin to view only their own sale and lets Owner view all sales", () => {
    expect(canViewSalesRecord({ id: "admin-1", name: "Admin", role: "ADMIN" }, sale)).toBe(true);
    expect(canViewSalesRecord({ id: "admin-2", name: "Admin Lain", role: "ADMIN" }, sale)).toBe(false);
    expect(canViewSalesRecord({ id: "owner-1", name: "Owner", role: "OWNER" }, sale)).toBe(true);
  });

  it("returns not-found semantics for another Admin's transaction", async () => {
    mocks.getSalesRecord.mockResolvedValue(sale);
    await expect(getSalesRecordForUser("S-1", { id: "admin-2", name: "Admin Lain", role: "ADMIN" })).resolves.toBeUndefined();
  });

  it("passes the server-derived Admin scope to pagination", async () => {
    mocks.listSalesRecordsPage.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
    await listSalesRecordsPageForUser(
      { id: "admin-1", name: "Admin", role: "ADMIN" },
      { page: 1, filters: { keyword: "pelanggan" } },
    );
    expect(mocks.listSalesRecordsPage).toHaveBeenCalledWith({
      page: 1,
      filters: { keyword: "pelanggan" },
      scope: { createdByUserId: "admin-1", excludeSource: "MJ" },
    });
  });
});
