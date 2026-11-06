/** Penjualan barang tanpa stok tetap jalan (default Ruko) dan masuk Laporan Consignment (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("sales without stock & consignment report (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let inv: typeof import("@/lib/inventory/service");
  let report: typeof import("@/lib/reports/consignmentReport");
  const run = Date.now().toString(36).toUpperCase();
  const day = "2030-02-10";
  let ruko: { id: string };
  let toko: { id: string };

  async function sale(reference: string, productId: string, sku: string, qty: number, price: number) {
    const tipe = await prisma.bookkeepingType.findFirst();
    await prisma.salesRecord.create({ data: {
      id: `CS-${reference}`, saleDate: new Date(`${day}T00:00:00Z`), transactionAt: new Date(`${day}T10:00:00+07:00`), transactionNumber: `CS-${reference}`,
      tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name, customerName: `Cust ${run}`, paymentMethod: "Cash",
      total: qty * price, approvalStatus: "approved", stockReleaseReference: reference,
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
      items: { create: [{ id: `CS-${reference}-0`, productRef: sku, productId, quantity: qty, unitPrice: price, sortOrder: 0 }] }
    } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    inv = await import("@/lib/inventory/service");
    report = await import("@/lib/reports/consignmentReport");
    // Lokasi Ruko lama dari uji sebelumnya dimatikan supaya tes memakai Ruko yang dibuat di sini.
    await prisma.inventoryLocation.updateMany({ where: { name: { contains: "ruko", mode: "insensitive" } }, data: { isActive: false } });
    ruko = await inv.createLocation({ code: `RUKO${run}`, name: "Ruko", type: "STORE", allowNegative: false, isDefault: false, isActive: true });
    toko = await inv.createLocation({ code: `TKC${run}`, name: "Toko C", type: "STORE", allowNegative: false, isDefault: false, isActive: true });
  });

  it("an item with no stock anywhere can still be sold and is taken from Ruko", async () => {
    const p = await inv.createProduct({ sku: `NOSTK-${run}`, name: "Tanpa Stok", unit: "Lusin", minimumStock: 0, costPrice: 0 } as never);
    await inv.releaseSaleStockLocal({ reference: `R1-${run}`, saleDate: day, items: [{ productId: p.id, quantity: 3 }] });
    const m = await prisma.inventoryMovement.findFirst({ where: { referenceNumber: `R1-${run}` } });
    expect(m?.locationId).toBe(ruko.id);
    expect(Number(m?.balanceAfter)).toBe(-3);
    await sale(`R1-${run}`, p.id, p.sku, 3, 50_000);
  });

  it("selling more than the store has does not fail; only the excess counts as consignment", async () => {
    const p = await inv.createProduct({ sku: `PART-${run}`, name: "Sebagian", unit: "Lusin", minimumStock: 0, costPrice: 0 } as never);
    await inv.createStockIn({ locationId: toko.id, items: [{ productId: p.id, quantity: 2, unitCost: 10_000 }] } as never);
    await inv.releaseSaleStockLocal({ reference: `R2-${run}`, saleDate: day, items: [{ productId: p.id, warehouseId: toko.id, quantity: 5 }] });
    await sale(`R2-${run}`, p.id, p.sku, 5, 20_000);

    const r = await report.getConsignmentReport({ from: day, to: day, keyword: run });
    const lines = r.sales.flatMap((s) => s.lines);
    expect(lines.find((l) => l.sku === `NOSTK-${run}`)).toMatchObject({ quantity: 3, amount: 150_000, location: "Ruko" });
    expect(lines.find((l) => l.sku === `PART-${run}`)).toMatchObject({ quantity: 3, amount: 60_000 });
    expect(r.days).toEqual([{ dayKey: day, notaCount: 2, quantity: 6, total: 210_000 }]);
  });

  it("a cancelled sale drops out of the report", async () => {
    await inv.cancelSaleStockLocal({ reference: `R1-${run}`, reason: "uji" });
    const r = await report.getConsignmentReport({ from: day, to: day, keyword: run });
    expect(r.sales.flatMap((s) => s.lines).some((l) => l.sku === `NOSTK-${run}`)).toBe(false);
  });

  it("sales taken from a warehouse appear in Permintaan Barang Gudang; store sales do not", async () => {
    const { getWarehouseRequests } = await import("@/lib/reports/warehouseRequests");
    const gudang = await inv.createLocation({ code: `GDC${run}`, name: `Gudang C ${run}`, type: "WAREHOUSE", allowNegative: false, isDefault: false, isActive: true });
    const p = await inv.createProduct({ sku: `GDG-${run}`, name: "Di Gudang", unit: "Lusin", minimumStock: 0, costPrice: 0 } as never);
    await inv.createStockIn({ locationId: gudang.id, items: [{ productId: p.id, quantity: 10, unitCost: 10_000 }] } as never);
    await inv.releaseSaleStockLocal({ reference: `R3-${run}`, saleDate: day, items: [{ productId: p.id, warehouseId: gudang.id, quantity: 4 }] });
    await sale(`R3-${run}`, p.id, p.sku, 4, 20_000);
    const r = await getWarehouseRequests({ from: day, to: day });
    expect(r.products.find((x) => x.sku === `GDG-${run}`)).toMatchObject({ quantity: 4, warehouse: `Gudang C ${run}`, notaCount: 1 });
    expect(r.products.some((x) => x.sku === `PART-${run}`)).toBe(false);
  });
});
