/** Regresi audit keamanan: retur penjualan dibatasi oleh nota asal (baris, sisa qty, harga jual). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const state = {
    sale: {
      id: "sale-1", transactionNumber: "INV-1", customerName: "Pelanggan", approvalStatus: "approved", stockReleaseReference: "REL-1",
      items: [{ id: "si-1", productRef: "SKU-A", productId: "p-a", quantity: 3, unitPrice: 100000 }]
    },
    previous: [] as Array<{ salesRecordItemId: string | null; productRef: string; quantity: number }>,
    created: null as null | { subtotalAmount: number; items: { create: Array<{ quantity: number; unitPrice: number; unitCostPrice: number; salesRecordItemId: string }> } }
  };
  return {
    state,
    prisma: {
      salesRecord: { findUnique: vi.fn(async () => state.sale) },
      salesReturnItem: { findMany: vi.fn(async () => state.previous) },
      salesReturn: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: any }) => { state.created = data; return { id: "ret-1", returnNumber: data.returnNumber, ...data }; })
      }
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/accounting/inventoryPosting", () => ({ saleUnitCost: vi.fn(async () => 60000) }));

import { createSalesReturn } from "@/lib/sales/returnStore";

const actor = { id: "admin-1", name: "Kasir", role: "ADMIN" as const };
const input = (items: Array<Record<string, unknown>>) => ({
  salesRecordId: "sale-1", returnDate: "2026-11-07", customerName: "Pelanggan", refundMethod: "REDUCE_RECEIVABLE", items
}) as any;

describe("sales return bounds", () => {
  beforeEach(() => { db.state.previous = []; db.state.created = null; });

  it("rejects a quantity above what was sold", async () => {
    await expect(createSalesReturn(input([{ salesRecordItemId: "si-1", productRef: "SKU-A", productName: "A", quantity: 500, unitPrice: 100000 }]), actor)).rejects.toThrow(/melebihi/);
    expect(db.state.created).toBeNull();
  });

  it("rejects an item that is not on the original sale", async () => {
    await expect(createSalesReturn(input([{ productRef: "SKU-Z", productName: "Z", quantity: 1, unitPrice: 100000 }]), actor)).rejects.toThrow(/nota asal/);
  });

  it("counts earlier returns of the same line", async () => {
    db.state.previous = [{ salesRecordItemId: "si-1", productRef: "SKU-A", quantity: 2 }];
    await expect(createSalesReturn(input([{ salesRecordItemId: "si-1", productRef: "SKU-A", productName: "A", quantity: 2, unitPrice: 100000 }]), actor)).rejects.toThrow(/melebihi/);
  });

  it("uses the sold price and FIFO cost, not the request body", async () => {
    await createSalesReturn(input([{ salesRecordItemId: "si-1", productRef: "SKU-A", productName: "A", quantity: 2, unitPrice: 9999999, unitCostPrice: 1 }]), actor);
    const line = db.state.created!.items.create[0];
    expect(line).toMatchObject({ quantity: 2, unitPrice: 100000, unitCostPrice: 60000, salesRecordItemId: "si-1" });
    expect(db.state.created!.subtotalAmount).toBe(200000);
  });
});
