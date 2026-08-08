import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: { id: "admin-1", name: "Admin", role: "ADMIN" as const },
  getSalesRecordForUser: vi.fn(),
  listAllRekeningAccounts: vi.fn(),
  formatSaleDotMatrix: vi.fn(() => "INVOICE"),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/sales/access", () => ({ getSalesRecordForUser: mocks.getSalesRecordForUser }));
vi.mock("@/lib/business/masterData", () => ({ listAllRekeningAccounts: mocks.listAllRekeningAccounts }));
vi.mock("@/lib/print/dotMatrix", () => ({ formatSaleDotMatrix: mocks.formatSaleDotMatrix, toEscPosPrn: vi.fn() }));

import { GET } from "@/app/api/print/sales/[id]/route";

const ownSale: Sale = {
  id: "S-OWN",
  saleDate: "2026-08-08",
  customerName: "Pelanggan",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Cash",
  total: 10000,
  items: [],
  createdByUserId: "admin-1",
  createdByNameSnapshot: "Admin",
  createdByRoleSnapshot: "ADMIN",
};

describe("sales print ownership", () => {
  beforeEach(() => {
    mocks.getSalesRecordForUser.mockReset();
    mocks.listAllRekeningAccounts.mockReset();
    mocks.formatSaleDotMatrix.mockClear();
    mocks.listAllRekeningAccounts.mockResolvedValue([]);
  });

  it("prints an accessible Admin transaction", async () => {
    mocks.getSalesRecordForUser.mockResolvedValue(ownSale);
    const response = await GET(new Request("http://local/api/print/sales/S-OWN"), { params: Promise.resolve({ id: "S-OWN" }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("INVOICE");
    expect(mocks.getSalesRecordForUser).toHaveBeenCalledWith("S-OWN", mocks.user);
  });

  it("returns 404 when ownership filtering hides the transaction", async () => {
    mocks.getSalesRecordForUser.mockResolvedValue(undefined);
    const response = await GET(new Request("http://local/api/print/sales/S-OTHER"), { params: Promise.resolve({ id: "S-OTHER" }) });

    expect(response.status).toBe(404);
    expect(mocks.formatSaleDotMatrix).not.toHaveBeenCalled();
  });
});
