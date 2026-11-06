/** Release ulang dengan referensi yang sudah dibalik harus memotong stok lagi (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("sale release after reversal (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let inv: typeof import("@/lib/inventory/service");
  const run = Date.now().toString(36).toUpperCase();
  let productId: string;
  let locationId: string;
  const qty = async () => Number((await prisma.inventoryBalance.findFirst({ where: { productId, locationId } }))?.quantity ?? 0);
  const release = (reference: string, quantity: number) =>
    inv.releaseSaleStockLocal({ reference, saleDate: "2030-03-01", items: [{ productId, warehouseId: locationId, quantity, allowNegative: false }] });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    inv = await import("@/lib/inventory/service");
    const loc = await prisma.inventoryLocation.create({ data: { code: `RR${run}`, name: `RR ${run}`, type: "WAREHOUSE", isActive: true } });
    const prod = await prisma.inventoryProduct.create({ data: { sku: `RR-${run}`, name: `RR ${run}`, unit: "Pcs" } });
    locationId = loc.id;
    productId = prod.id;
    await inv.createAdjustment({ locationId, reason: "uji", adjustmentDate: "2030-03-01", items: [{ productId, quantity: 10, unitCost: 100 }] }, { id: "t", name: "t" });
  });

  it("replays are idempotent, a reversed reference releases again, and oversell is refused", async () => {
    const ref = `RR-${run}-A`;
    expect(await release(ref, 4)).toEqual({ status: "released" });
    expect(await release(ref, 4)).toEqual({ status: "already_released" });
    expect(await qty()).toBe(6);

    await inv.cancelSaleStockLocal({ reference: ref, reason: "uji", mustExist: true });
    expect(await qty()).toBe(10);

    expect(await release(ref, 4)).toEqual({ status: "released" });
    expect(await qty()).toBe(6);
    expect(await release(ref, 4)).toEqual({ status: "already_released" });

    await expect(release(`RR-${run}-B`, 7)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await qty()).toBe(6);

    await inv.cancelSaleStockLocal({ reference: ref, reason: "uji", mustExist: true });
    expect(await qty()).toBe(10);
  });

  it("replace swaps the release atomically; a failed replace keeps the old release", async () => {
    const ref = `RR-${run}-C`;
    const start = await qty();
    await release(ref, 4);
    expect(await qty()).toBe(start - 4);

    // too big: whole replace rolls back, old release stays held
    await expect(inv.replaceSaleStockLocal({ oldReference: ref, reference: `${ref}-REV1`, saleDate: "2030-03-01", items: [{ productId, warehouseId: locationId, quantity: start + 50, allowNegative: false }] }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await qty()).toBe(start - 4);

    // unknown old reference
    await expect(inv.replaceSaleStockLocal({ oldReference: `${ref}-NOPE`, reference: `${ref}-NOPE-REV1`, saleDate: "2030-03-01", items: [{ productId, warehouseId: locationId, quantity: 1, allowNegative: false }] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // good replace: 4 -> 7
    await inv.replaceSaleStockLocal({ oldReference: ref, reference: `${ref}-REV1`, saleDate: "2030-03-01", items: [{ productId, warehouseId: locationId, quantity: 7, allowNegative: false }] });
    expect(await qty()).toBe(start - 7);

    // MJ died before saving the new pointer: cancel by the stale reference still returns everything
    await inv.cancelSaleStockLocal({ reference: ref, reason: "uji", mustExist: true });
    expect(await qty()).toBe(start);

    // a prefix lookalike must not be touched
    const other = `${ref}9`;
    await release(other, 2);
    await inv.cancelSaleStockLocal({ reference: ref, reason: "uji", mustExist: true });
    expect(await qty()).toBe(start - 2);
    await inv.cancelSaleStockLocal({ reference: other, reason: "uji", mustExist: true });
    expect(await qty()).toBe(start);
  });
});
