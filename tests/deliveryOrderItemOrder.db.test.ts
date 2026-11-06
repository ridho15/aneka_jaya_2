/** Urutan item DO = urutan baris penjualan, juga setelah invoice diedit (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("delivery order item order (postgres)", () => {
  let store: typeof import("@/lib/deliveryOrders/store");
  let prisma: typeof import("@/lib/db/prisma").prisma;
  const saleId = `DO-ORDER-TEST-${Date.now()}`;

  const items = (skus: string[], stamp: string) => skus.map((sku, index) => ({
    id: `${saleId}-item-${stamp}-${index}`, productRef: sku, quantity: index + 1, unitPrice: 1000, sortOrder: index
  }));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    store = await import("@/lib/deliveryOrders/store");
    const tipe = await prisma.bookkeepingType.findFirst();
    await prisma.salesRecord.create({ data: {
      id: saleId, saleDate: new Date(), tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name,
      customerName: "Uji Urutan", paymentMethod: "Cash", total: 0, approvalStatus: "approved",
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
      items: { create: items(Array.from({ length: 12 }, (_, i) => `SKU-${String.fromCharCode(65 + i)}`), "a") }
    } });
  });

  afterAll(async () => {
    await prisma.deliveryOrder.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.salesRecord.deleteMany({ where: { id: saleId } });
  });

  const refs = (rows: Array<{ productRef: string }> | undefined) => (rows || []).map((r) => r.productRef);

  it("keeps sales order for 12 items, and again after the sale is edited", async () => {
    const first = await store.syncDeliveryOrderForSale(saleId);
    const original = Array.from({ length: 12 }, (_, i) => `SKU-${String.fromCharCode(65 + i)}`);
    expect(refs(first?.items)).toEqual(original);

    const edited = ["SKU-Z", ...original.slice().reverse()];
    await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.salesRecordItem.createMany({ data: items(edited, "b").map((it) => ({ ...it, salesRecordId: saleId })) });

    const synced = await store.syncDeliveryOrderForSale(saleId);
    expect(refs(synced?.items)).toEqual(edited);
    const detail = await store.getDeliveryOrderDetail(synced!.id);
    expect(refs(detail?.items as Array<{ productRef: string }>)).toEqual(edited);

  });
});
