/** Persediaan sebagai aset: FIFO, jurnal barang masuk, HPP, transfer, retur, pembatalan (jalan bila INVENTORY_TEST_DATABASE_URL diset). */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: async () => undefined }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("inventory as an asset (postgres)", () => {
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let inv: typeof import("@/lib/inventory/service");
  let posting: typeof import("@/lib/accounting/inventoryPosting");
  let salesHooks: typeof import("@/lib/sales/postingHooks");
  const run = Date.now().toString(36).toUpperCase();
  let gudang: { id: string };
  let toko: { id: string };
  let productId: string;
  const actor = { id: "test", name: "Test", role: "OWNER" as const };

  /** Saldo debit − kredit akun dari jurnal POSTED/REVERSED (pembalikan ikut dihitung). */
  async function balance(code: string) {
    const rows = await prisma.journalLine.aggregate({
      // Hanya jurnal uji ini (semua sourceId memuat kode run), supaya tes lain yang berjalan bersamaan tidak ikut terhitung.
      where: { accountCodeSnapshot: code, journalEntry: { status: { in: ["POSTED", "REVERSED"] }, sourceId: { contains: run } } },
      _sum: { debit: true, credit: true }
    });
    return Number(rows._sum.debit ?? 0) - Number(rows._sum.credit ?? 0);
  }
  async function stockValue(id: string) {
    const layers = await prisma.inventoryCostLayer.findMany({ where: { productId: id } });
    return Math.round(layers.reduce((s, l) => s + Number(l.remaining) * Number(l.unitCost), 0));
  }
  async function makeSale(reference: string) {
    const tipe = await prisma.bookkeepingType.findFirst();
    const id = `FIFO-SALE-${run}-${reference}`;
    await prisma.salesRecord.create({ data: {
      id, saleDate: new Date(), tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name,
      customerName: "Uji FIFO", paymentMethod: "Cash", total: 0, approvalStatus: "approved", stockReleaseReference: reference,
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
      items: { create: [{ id: `${id}-item-0`, productRef: `FIFO-${run}`, productId, quantity: 4, unitPrice: 150000, sortOrder: 0 }] }
    } });
    return id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import("@/lib/db/prisma"));
    inv = await import("@/lib/inventory/service");
    posting = await import("@/lib/accounting/inventoryPosting");
    salesHooks = await import("@/lib/sales/postingHooks");
    gudang = await inv.createLocation({ code: `GF${run}`, name: "Gudang FIFO", type: "WAREHOUSE", allowNegative: false, isDefault: false, isActive: true });
    toko = await inv.createLocation({ code: `TF${run}`, name: "Toko FIFO", type: "STORE", allowNegative: false, isDefault: false, isActive: true });
    const product = await inv.createProduct({ sku: `FIFO-${run}`, name: "Barang Uji FIFO", unit: "Lusin", minimumStock: 0, costPrice: 0 } as never);
    productId = product.id;
  });

  it("goods bought for resale (Rp1.000.000) increase inventory by Rp1.000.000, once even when repeated", async () => {
    const inv0 = await balance("1-1005");
    const pay0 = await balance("2-1005");
    const input = { locationId: gudang.id, idempotencyKey: `fifo-${run}-a`, items: [{ productId, quantity: 10, unitCost: 100000 }] };
    await inv.createStockIn(input as never);
    await inv.createStockIn(input as never);
    await posting.postPendingInventoryJournals();
    expect(await balance("1-1005") - inv0).toBe(1_000_000);
    expect(pay0 - await balance("2-1005")).toBe(1_000_000);
    expect(await stockValue(productId)).toBe(1_000_000);
    expect(await prisma.journalEntry.count({ where: { sourceType: "INVENTORY", sourceId: `STOCK_IN:key:fifo-${run}-a` } })).toBe(1);
  });

  it("FIFO: a later receipt at a different cost is consumed after the older one", async () => {
    await inv.createStockIn({ locationId: gudang.id, idempotencyKey: `fifo-${run}-b`, items: [{ productId, quantity: 10, unitCost: 120000 }] } as never);
    expect(await stockValue(productId)).toBe(2_200_000);
  });

  it("transfer between locations changes neither total inventory value nor the ledger", async () => {
    const gl0 = await balance("1-1005");
    const v0 = await stockValue(productId);
    await inv.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: true, items: [{ productId, quantity: 6 }] } as never);
    expect(await stockValue(productId)).toBe(v0);
    expect(await balance("1-1005")).toBe(gl0);
  });

  it("selling 4 units moves their FIFO cost (Rp400.000) from inventory to HPP", async () => {
    const inv0 = await balance("1-1005");
    const cogs0 = await balance("5-1001");
    const reference = `FIFO-REL-${run}`;
    await inv.releaseSaleStockLocal({ reference, saleDate: new Date().toISOString().slice(0, 10), items: [{ productId, warehouseId: toko.id, quantity: 4 }] });
    const saleId = await makeSale(reference);
    await salesHooks.postSalesCogsJournal(saleId);
    await salesHooks.postSalesCogsJournal(saleId);
    expect(inv0 - await balance("1-1005")).toBe(400_000);
    expect(await balance("5-1001") - cogs0).toBe(400_000);
    const sale = await prisma.salesRecord.findUnique({ where: { id: saleId } });
    expect(sale?.cogsStatus).toBe("COMPLETE");
    expect(await posting.saleUnitCost(reference, { productId })).toBe(100000);
  });

  it("a return brings goods back at the cost they were sold for", async () => {
    const v0 = await stockValue(productId);
    const unitCost = await posting.saleUnitCost(`FIFO-REL-${run}`, { productId });
    await inv.returnSaleStockLocal({ returnId: `RET-${run}`, returnNumber: `RET-${run}`, returnDate: new Date().toISOString().slice(0, 10),
      items: [{ lineId: "1", productId, warehouseId: toko.id, quantity: 1, unitCost: unitCost ?? undefined }] });
    expect(await stockValue(productId) - v0).toBe(100_000);
  });

  it("cancelling a sale restores inventory and reverses HPP", async () => {
    const reference = `FIFO-REL2-${run}`;
    const before = await stockValue(productId);
    await inv.releaseSaleStockLocal({ reference, saleDate: new Date().toISOString().slice(0, 10), items: [{ productId, warehouseId: toko.id, quantity: 2 }] });
    const saleId = await makeSale(reference);
    const inv0 = await balance("1-1005");
    await salesHooks.postSalesCogsJournal(saleId);
    await inv.cancelSaleStockLocal({ reference, reason: "uji batal" });
    await salesHooks.reverseSalesJournals(saleId, actor, "uji batal");
    expect(await balance("1-1005")).toBe(inv0);
    expect(await stockValue(productId)).toBe(before);
  });

  it("stock card value matches the ledger movement for this product's documents", async () => {
    const movements = await prisma.inventoryMovement.findMany({ where: { productId, totalCost: { not: null } } });
    const net = Math.round(movements.reduce((s, m) => s + Number(m.totalCost), 0));
    expect(net).toBe(await stockValue(productId));
  });

  it("goods with no known cost are flagged and HPP stays incomplete instead of guessed", async () => {
    const p = await inv.createProduct({ sku: `NOCOST-${run}`, name: "Tanpa Modal", unit: "Pcs", minimumStock: 0, costPrice: 0 } as never);
    await inv.createStockIn({ locationId: gudang.id, items: [{ productId: p.id, quantity: 5 }] } as never);
    const m = await prisma.inventoryMovement.findFirst({ where: { productId: p.id, type: "PURCHASE_RECEIPT" } });
    expect(m?.costComplete).toBe(false);
    const reference = `NOCOST-REL-${run}`;
    await inv.releaseSaleStockLocal({ reference, saleDate: new Date().toISOString().slice(0, 10), items: [{ productId: p.id, warehouseId: gudang.id, quantity: 2 }] });
    const tipe = await prisma.bookkeepingType.findFirst();
    const saleId = `NOCOST-SALE-${run}`;
    await prisma.salesRecord.create({ data: {
      id: saleId, saleDate: new Date(), tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name,
      customerName: "Uji", paymentMethod: "Cash", total: 0, approvalStatus: "approved", stockReleaseReference: reference,
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
      items: { create: [{ id: `${saleId}-item-0`, productRef: `NOCOST-${run}`, productId: p.id, quantity: 2, unitPrice: 50000, sortOrder: 0 }] }
    } });
    const journal = await salesHooks.postSalesCogsJournal(saleId);
    expect(journal).toBeNull();
    const sale = await prisma.salesRecord.findUnique({ where: { id: saleId } });
    expect(sale?.cogsStatus).toBe("INCOMPLETE");
  });

  it("consignment goods stay out of inventory value; when sold their cost becomes a payable to the consignor", async () => {
    const p = await inv.createProduct({ sku: `TTP-${run}`, name: "Barang Titipan", unit: "Pcs", minimumStock: 0, costPrice: 50000 } as never);
    await inv.updateProduct(p.id, { ownership: "CONSIGNMENT", consignorName: "Toko Mawar" } as never);
    const inv0 = await balance("1-1005");
    await inv.createStockIn({ locationId: gudang.id, idempotencyKey: `ttp-${run}`, items: [{ productId: p.id, quantity: 10, unitCost: 50000 }] } as never);
    expect(await prisma.inventoryCostLayer.count({ where: { productId: p.id } })).toBe(0);
    expect(await balance("1-1005")).toBe(inv0);

    const reference = `TTP-REL-${run}`;
    await inv.releaseSaleStockLocal({ reference, saleDate: new Date().toISOString().slice(0, 10), items: [{ productId: p.id, warehouseId: gudang.id, quantity: 3 }] });
    const tipe = await prisma.bookkeepingType.findFirst();
    const saleId = `TTP-SALE-${run}`;
    await prisma.salesRecord.create({ data: {
      id: saleId, saleDate: new Date(), tipeId: tipe!.id, tipeCodeSnapshot: tipe!.code, tipeNameSnapshot: tipe!.name,
      customerName: "Uji", paymentMethod: "Cash", total: 0, approvalStatus: "approved", stockReleaseReference: reference,
      createdByUserId: "test", createdByNameSnapshot: "Test", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
      items: { create: [{ id: `${saleId}-item-0`, productRef: `TTP-${run}`, productId: p.id, quantity: 3, unitPrice: 80000, sortOrder: 0 }] }
    } });
    const journal = await salesHooks.postSalesCogsJournal(saleId);
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: journal!.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => [l.accountCodeSnapshot, Number(l.debit), Number(l.credit)])).toEqual([["5-1001", 150000, 0], ["2-1006", 0, 150000]]);
    expect(await balance("1-1005")).toBe(inv0);

    await expect(inv.updateProduct(p.id, { ownership: "OWN" } as never)).rejects.toThrow(/stoknya 0/);
  });
});
