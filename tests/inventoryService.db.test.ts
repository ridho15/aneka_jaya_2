/**
 * Integration test modul inventory terhadap PostgreSQL sungguhan.
 * Dijalankan hanya bila INVENTORY_TEST_DATABASE_URL diset (database kosong yang
 * sudah di-migrate), mis.:
 *   INVENTORY_TEST_DATABASE_URL=postgresql://... npx vitest run tests/inventoryService.db.test.ts
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const erpRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: async () => ({ success: true, data: erpRows.rows }) }));

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("inventory service (postgres)", () => {
  let svc: typeof import("@/lib/inventory/service");
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let gudang: { id: string };
  let toko: { id: string };
  const sku = `SKU-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    svc = await import("@/lib/inventory/service");
    prisma = (await import("@/lib/db/prisma")).prisma;
    const suffix = Date.now().toString(36).toUpperCase();
    gudang = await svc.createLocation({ code: `GU-${suffix}`, name: "Gudang Utama Test", type: "WAREHOUSE", allowNegative: false, isDefault: false, isActive: true });
    toko = await svc.createLocation({ code: `TK-${suffix}`, name: "Toko Test", type: "STORE", allowNegative: false, isDefault: false, isActive: true });
    await svc.createProduct({ sku, name: "Barang Test", unit: "PCS", minimumStock: 5, costPrice: 1000, sellingPrice: 1500, isActive: true, initialStock: [{ locationId: gudang.id, quantity: 100, unitCost: 1000 }] });
  });

  const qty = async (locationId: string) => {
    const product = await prisma.inventoryProduct.findUniqueOrThrow({ where: { sku } });
    const b = await prisma.inventoryBalance.findUnique({ where: { productId_locationId: { productId: product.id, locationId } } });
    return Number(b?.quantity ?? 0);
  };

  it("stok awal tercatat di gudang", async () => {
    expect(await qty(gudang.id)).toBe(100);
  });

  it("transfer langsung diterima memindahkan stok gudang → toko", async () => {
    const t = await svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: true, items: [{ sku, quantity: 30 }] });
    expect(t.status).toBe("RECEIVED");
    expect(await qty(gudang.id)).toBe(70);
    expect(await qty(toko.id)).toBe(30);
  });

  it("transfer dalam perjalanan baru masuk setelah diterima, dan bisa dibatalkan", async () => {
    const t = await svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: false, items: [{ sku, quantity: 10 }] });
    expect(await qty(gudang.id)).toBe(60);
    expect(await qty(toko.id)).toBe(30);
    await svc.receiveTransfer(t.id);
    expect(await qty(toko.id)).toBe(40);
    await expect(svc.receiveTransfer(t.id)).rejects.toMatchObject({ code: "INVALID_STATE" });

    const t2 = await svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: false, items: [{ sku, quantity: 5 }] });
    expect(await qty(gudang.id)).toBe(55);
    await svc.cancelTransfer(t2.id, undefined, "salah input");
    expect(await qty(gudang.id)).toBe(60);
  });

  it("menolak transfer bila stok tidak cukup (tanpa efek samping)", async () => {
    await expect(svc.createTransfer({ fromLocationId: toko.id, toLocationId: gudang.id, receiveNow: true, items: [{ sku, quantity: 999 }] }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await qty(toko.id)).toBe(40);
    expect(await qty(gudang.id)).toBe(60);
  });

  it("adjustment menambah dan mengurangi stok", async () => {
    await svc.createAdjustment({ locationId: toko.id, reason: "barang rusak", items: [{ sku, quantity: -3 }, { sku, quantity: 1 }] });
    expect(await qty(toko.id)).toBe(38);
  });

  it("opname mengganti stok sistem dengan hasil hitung fisik", async () => {
    const o = await svc.createOpname({ locationId: toko.id, items: [{ sku, countedQty: 35 }] });
    expect(Number(o.items[0].systemQty)).toBe(38);
    expect(Number(o.items[0].differenceQty)).toBe(-3);
    expect(await qty(toko.id)).toBe(35);
  });

  it("idempotencyKey mencegah posting ganda", async () => {
    const key = `idem-${Date.now()}`;
    const a = await svc.createAdjustment({ locationId: gudang.id, reason: "retry api", idempotencyKey: key, items: [{ sku, quantity: 5 }] });
    const b = await svc.createAdjustment({ locationId: gudang.id, reason: "retry api", idempotencyKey: key, items: [{ sku, quantity: 5 }] });
    expect(b.id).toBe(a.id);
    expect(await qty(gudang.id)).toBe(65);
  });

  it("penjualan paralel tidak membuat stok minus", async () => {
    // toko punya 35; 10 penjualan @5 paralel → maksimal 7 berhasil
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      svc.releaseSaleStockLocal({ reference: `SALE-${sku}-${i}`, saleDate: new Date().toISOString(), items: [{ productRef: sku, warehouseId: toko.id, quantity: 5 }] })
    ));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(7);
    expect(await qty(toko.id)).toBe(0);
  });

  it("release penjualan idempotent dan pembatalan mengembalikan stok", async () => {
    const ref = `SALE-${sku}-0`;
    expect((await svc.releaseSaleStockLocal({ reference: ref, saleDate: new Date().toISOString(), items: [{ productRef: sku, warehouseId: toko.id, quantity: 5 }] })).status).toBe("already_released");
    await svc.cancelSaleStockLocal({ reference: ref, reason: "batal" });
    await svc.cancelSaleStockLocal({ reference: ref, reason: "batal" });
    expect(await qty(toko.id)).toBe(5);
  });

  it("kartu stok mencatat saldo berjalan", async () => {
    const product = await prisma.inventoryProduct.findUniqueOrThrow({ where: { sku } });
    const card = await svc.listMovements({ productId: product.id, locationId: gudang.id, pageSize: 100 });
    const chronological = [...card.data].reverse();
    for (let i = 1; i < chronological.length; i++) {
      expect(chronological[i].balanceBefore).toBe(chronological[i - 1].balanceAfter);
    }
    expect(chronological[chronological.length - 1].balanceAfter).toBe(await qty(gudang.id));
  });

  it("matriks stok menampilkan gudang & toko dalam satu baris", async () => {
    const m = await svc.stockMatrix({ keyword: sku });
    const row = m.data.find((r) => r.sku === sku)!;
    expect(row.perLocation[gudang.id]).toBe(65);
    expect(row.perLocation[toko.id]).toBe(5);
    expect(row.warehouseTotal).toBeGreaterThanOrEqual(65);
  });

  it("impor ERP membuat gudang/barang dan men-SET saldo (aman diulang)", async () => {
    const { importInventoryFromErp } = await import("@/lib/inventory/erpImport");
    const erpSku = `ERP-${sku}`;
    const whId = 900000 + Math.floor(Math.random() * 99999);
    const erpPid = 700000 + Math.floor(Math.random() * 99999);
    erpRows.rows = [
      { id: "a", product_id: erpPid, product_sku: erpSku, product_name: "Barang ERP", warehouse_id: whId, warehouse: "Toko Cabang ERP", qty_available: 12, unit: "PCS" },
      { id: "b", product_id: erpPid, product_sku: erpSku, product_name: "Barang ERP", warehouse_id: whId, warehouse: "Toko Cabang ERP", qty_available: 3, unit: "PCS" }
    ];
    const dry = await importInventoryFromErp({ dryRun: true });
    expect(dry.balancesSet).toBe(1);
    expect(await prisma.inventoryProduct.findUnique({ where: { sku: erpSku } })).toBeNull();

    const first = await importInventoryFromErp({ dryRun: false });
    expect(first.locationsCreated).toBe(1);
    expect(first.productsCreated).toBe(1);
    const loc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { erpWarehouseId: whId } });
    expect(loc.type).toBe("STORE");
    const product = await prisma.inventoryProduct.findUniqueOrThrow({ where: { sku: erpSku } });
    const bal = () => prisma.inventoryBalance.findUnique({ where: { productId_locationId: { productId: product.id, locationId: loc.id } } }).then((b) => Number(b?.quantity));
    expect(await bal()).toBe(15);

    erpRows.rows = [{ id: "a", product_id: erpPid, product_sku: erpSku, product_name: "Barang ERP", warehouse_id: whId, warehouse: "Toko Cabang ERP", qty_available: 10 }];
    const second = await importInventoryFromErp({ dryRun: false });
    expect(second.productsCreated).toBe(0);
    expect(await bal()).toBe(10);

    // penjualan dengan ID ERP lama terpetakan ke barang & gudang lokal
    await svc.releaseSaleStockLocal({ reference: `ERP-SALE-${sku}`, saleDate: new Date().toISOString(), items: [{ productId: String(erpPid), warehouseId: String(whId), quantity: 4 }] });
    expect(await bal()).toBe(6);
  });

  it("nomor dokumen otomatis tetap unik saat adjustment dibuat bersamaan", async () => {
    const docs = await Promise.all(Array.from({ length: 5 }, () => svc.createAdjustment({ locationId: gudang.id, reason: "paralel", items: [{ sku, quantity: 1 }] })));
    expect(new Set(docs.map((d) => d.adjustmentNumber)).size).toBe(5);
  });

  it("locationId menerima kode lokasi", async () => {
    const loc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { id: gudang.id } });
    const adj = await svc.createAdjustment({ locationId: loc.code.toLowerCase(), reason: "via kode", items: [{ sku, quantity: 1 }] });
    expect(adj.locationId).toBe(gudang.id);
  });

  it("qty dalam koli: transfer & opname memakai isi per koli", async () => {
    const koliSku = `KOLI-${sku}`;
    await svc.createProduct({ sku: koliSku, name: "Kuku Koli", unit: "Lusin", unitsPerKoli: 60, minimumStock: 0, costPrice: 1000, sellingPrice: 0, isActive: true, initialStock: [{ locationId: gudang.id, quantity: 600 }] });
    await svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: true, items: [{ sku: koliSku, koli: 2, loose: 5 }] });
    const bal = await svc.listBalances({ sku: koliSku, includeZero: true });
    const g = bal.data.find((b) => b.locationId === gudang.id)!;
    expect(g.quantity).toBe(475);
    expect(g.koliText).toBe("7 koli + 55 Lusin");
    const o = await svc.createOpname({ locationId: toko.id, items: [{ sku: koliSku, koli: 1, loose: 3 }] });
    expect(Number(o.items[0].countedQty)).toBe(63);
    await expect(svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: true, items: [{ sku, koli: 1 }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("ganti kurs RMB hanya menghitung ulang harga modal", async () => {
    const { setRmbRate } = await import("@/lib/inventory/pricing");
    await setRmbRate(2750);
    const rmbSku = `RMB-${sku}`;
    const created = await svc.createProduct({ sku: rmbSku, name: "Barang Impor", unit: "Lusin", priceRmb: 20, extraCostIdr: 1500, minimumStock: 0, costPrice: 1, sellingPrice: 99000, isActive: true, initialStock: [{ locationId: gudang.id, quantity: 10 }] });
    expect(created.costPrice).toBe(56500);
    const result = await setRmbRate(2800);
    expect(result.previousRate).toBe(2750);
    expect(result.updatedProducts).toBeGreaterThanOrEqual(1);
    const p = await svc.getProduct(rmbSku);
    expect(p.costPrice).toBe(57500);
    expect(p.sellingPrice).toBe(99000);
    expect(p.stocks.find((s) => s.locationId === gudang.id)?.avgCost).toBe(56500);
    const updated = await svc.updateProduct(rmbSku, { extraCostIdr: 0 });
    expect(updated.costPrice).toBe(56000);
  });

  it("isi 1 koli yang diisi saat input stok tersimpan ke master barang", async () => {
    const newSku = `ISI-${sku}`;
    await svc.createProduct({ sku: newSku, name: "Tanpa Isi Koli", unit: "Lusin", minimumStock: 0, costPrice: 0, sellingPrice: 0, isActive: true });
    await svc.createStockIn({ locationId: gudang.id, items: [{ sku: newSku, koli: 3, unitsPerKoli: 60, loose: 4 }] });
    let p = await svc.getProduct(newSku);
    expect(p.unitsPerKoli).toBe(60);
    expect(p.totalQuantity).toBe(184);
    // input berikutnya cukup koli, isi diambil dari master
    await svc.createTransfer({ fromLocationId: gudang.id, toLocationId: toko.id, receiveNow: true, items: [{ sku: newSku, koli: 1 }] });
    p = await svc.getProduct(newSku);
    expect(p.stocks.find((s) => s.locationId === toko.id)?.quantity).toBe(60);
    expect(p.stocks.find((s) => s.locationId === gudang.id)?.koliText).toBe("2 koli + 4 Lusin");
  });

  it("retur penjualan mengembalikan stok ke lokasi asal (aman diulang)", async () => {
    const retSku = `RET-${sku}`;
    await svc.createProduct({ sku: retSku, name: "Barang Retur", unit: "Lusin", minimumStock: 0, costPrice: 0, sellingPrice: 0, isActive: true, initialStock: [{ locationId: toko.id, quantity: 10 }] });
    await svc.releaseSaleStockLocal({ reference: `SALE-RET-${sku}`, saleDate: new Date().toISOString(), items: [{ productRef: retSku, warehouseId: toko.id, quantity: 6 }] });
    const input = { returnId: `ret-${sku}`, returnNumber: `RTR-${sku}`, returnDate: new Date().toISOString(), items: [{ lineId: "l1", productRef: retSku, warehouseId: toko.id, quantity: 2 }] };
    await svc.returnSaleStockLocal(input);
    await svc.returnSaleStockLocal(input);
    const p = await svc.getProduct(retSku);
    expect(p.stocks.find((s) => s.locationId === toko.id)?.quantity).toBe(6);
    const card = await svc.listMovements({ productId: p.id, type: "SALE_RETURN" });
    expect(card.data).toHaveLength(1);
  });

  it("riwayat barang masuk dikelompokkan per dokumen", async () => {
    await svc.createStockIn({ locationId: gudang.id, referenceNumber: `SJ-${sku}`, items: [{ sku, quantity: 3, unitCost: 1000 }, { sku: `KOLI-${sku}`, koli: 1 }] });
    const history = await svc.listStockInHistory();
    const doc = history.find((h) => h.referenceNumber === `SJ-${sku}`)!;
    expect(doc.items).toHaveLength(2);
    expect(doc.items.find((i) => i.sku === `KOLI-${sku}`)?.koliText).toBe("1 koli");
  });

  it("matriks stok: paling sedikit di atas (dalam koli), ≤ 1 koli ditandai, stok 0 paling bawah", async () => {
    const tag = `MTX${Date.now().toString(36).toUpperCase()}`;
    const loc = await svc.createLocation({ code: `TK-${tag}`, name: "Toko Matriks", type: "STORE", allowNegative: false, isDefault: false, isActive: true });
    const mk = (s: string, qty: number, perKoli?: number) => svc.createProduct({ sku: `${tag}-${s}`, name: `${tag} ${s}`, unit: "Lusin", unitsPerKoli: perKoli ?? null, minimumStock: 0, costPrice: 0, sellingPrice: 0, isActive: true, initialStock: qty ? [{ locationId: loc.id, quantity: qty }] : [] });
    await mk("A", 600, 60); // 10 koli
    await mk("B", 60, 60);  // 1 koli → merah
    await mk("C", 0, 60);   // 0 → paling bawah
    await mk("D", 150, 60); // 2.5 koli
    const m = await svc.stockMatrix({ keyword: tag, locationType: "STORE" });
    expect(m.data.map((r) => r.sku)).toEqual([`${tag}-B`, `${tag}-D`, `${tag}-A`, `${tag}-C`]);
    expect(m.data.map((r) => r.lowStock)).toEqual([true, false, false, false]);
    const hidden = await svc.stockMatrix({ keyword: tag, locationType: "STORE", hideZero: true });
    expect(hidden.data).toHaveLength(3);
    expect(hidden.meta.total).toBe(3);
  });

  it("ubah satuan massal", async () => {
    const unit = `U${Date.now().toString(36)}`.slice(0, 12);
    await svc.createProduct({ sku: `BU1-${sku}`, name: "Bulk 1", unit, minimumStock: 0, costPrice: 0, sellingPrice: 0, isActive: true });
    await svc.createProduct({ sku: `BU2-${sku}`, name: "Bulk 2", unit, minimumStock: 0, costPrice: 0, sellingPrice: 0, isActive: true });
    const r = await svc.bulkChangeUnit({ fromUnit: unit, toUnit: "Lusin" });
    expect(r.updated).toBe(2);
    expect((await svc.getProduct(`BU1-${sku}`)).unit).toBe("Lusin");
  });
});
