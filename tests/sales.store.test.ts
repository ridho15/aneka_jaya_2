import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    salesRecord: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { getSalesRecord, listSalesRecords, saveSalesRecord } from "@/lib/sales/store";

const dbSale = {
  id: "S-1",
  saleDate: new Date("2026-06-27"),
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  customerName: "Budi",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Tempo",
  dueDate: new Date("2026-07-27"),
  rekeningId: "cash-w",
  transferAccount: null,
  notes: null,
  total: 20000,
  approvalStatus: "approved",
  createdByUserId: "owner-1",
  createdByNameSnapshot: "Owner",
  createdByRoleSnapshot: "OWNER",
  createdAt: new Date("2026-06-27T00:00:00.000Z"),
  items: [
    { id: "I-1", salesRecordId: "S-1", productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0, sortOrder: 0 }
  ]
};

describe("sales store normalized persistence", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    mocks.prisma.salesRecord.findMany.mockReset();
    mocks.prisma.salesRecord.findUnique.mockReset();
    mocks.prisma.salesRecord.create.mockReset();
    mocks.prisma.salesRecord.update.mockReset();
  });

  it("maps normalized sales item rows back to the public Sale.items array", async () => {
    mocks.prisma.salesRecord.findMany.mockResolvedValue([dbSale]);

    await expect(listSalesRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "S-1",
        items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
      })
    ]);
    expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { items: { orderBy: { sortOrder: "asc" } } }
    }));
  });

  it("keeps getSalesRecord compatible with print and reporting callers", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(dbSale);

    await expect(getSalesRecord("S-1")).resolves.toMatchObject({
      id: "S-1",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    });
  });

  it("writes sales items through nested normalized rows", async () => {
    mocks.prisma.salesRecord.create.mockResolvedValue(dbSale);

    await saveSalesRecord({
      id: "S-2",
      saleDate: "2026-06-28",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Ani",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      total: 5000,
      approvalStatus: "approved",
      createdByUserId: "owner-1",
      createdByNameSnapshot: "Owner",
      createdByRoleSnapshot: "OWNER",
      items: [{ productRef: "P-2", quantity: 1, unitPrice: 5000, discount: 0 }]
    });

    expect(mocks.prisma.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ productRef: "P-2", sortOrder: 0 })] }
      })
    }));
  });
});
