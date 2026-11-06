import "server-only";
import { Prisma, type InventoryMovementType, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { InventoryError } from "./errors";
import { applyDelta, formatKoli, hasRealName, qtyFromKoli, round2, splitKoli } from "./math";
export { hasRealName } from "./math";
import { applyRmbCost } from "./pricing";
import { ensureOpeningLayer, productHasLayers, valueMovement } from "./costing";
import { postInventoryDocumentJournalSafely } from "@/lib/accounting/inventoryPosting";
import { JAKARTA_TIME_ZONE, jakartaMonthKey } from "@/lib/date/jakarta";
import { DEFAULT_UNIT } from "./config";
import type {
  AdjustmentInput,
  LocationInput,
  OpnameInput,
  ProductInput,
  ProductRefInput,
  StockInInput,
  TransferInput
} from "./validation";

export type Tx = Prisma.TransactionClient;
export type InventoryActor = { id?: string; name?: string };

type MovementLine = {
  productId: string;
  locationId: string;
  delta: number;
  type: InventoryMovementType;
  movementDate: Date;
  unitCost?: number;
  referenceType: string;
  referenceId?: string;
  referenceNumber?: string;
  idempotencyKey?: string;
  notes?: string;
  allowNegative?: boolean;
  /** Sumber lapisan FIFO bila bukan bawaan tipe pergerakan. */
  layerSource?: string;
};

const num = (value: Prisma.Decimal | number | null | undefined) => (value == null ? 0 : Number(value));

// ---------------------------------------------------------------------
// Core posting
// ---------------------------------------------------------------------

/** Kunci baris saldo (dibuat bila belum ada) agar posting paralel tetap konsisten. */
async function lockBalance(tx: Tx, productId: string, locationId: string) {
  await tx.inventoryBalance.upsert({
    where: { productId_locationId: { productId, locationId } },
    create: { productId, locationId },
    update: {}
  });
  const rows = await tx.$queryRaw<{ id: string; quantity: Prisma.Decimal; avgCost: Prisma.Decimal }[]>`
    SELECT "id", "quantity", "avgCost" FROM "InventoryBalance"
    WHERE "productId" = ${productId} AND "locationId" = ${locationId}
    FOR UPDATE`;
  return { id: rows[0].id, quantity: num(rows[0].quantity), avgCost: num(rows[0].avgCost) };
}

export async function currentQuantity(tx: Tx, productId: string, locationId: string) {
  return (await lockBalance(tx, productId, locationId)).quantity;
}
export const lockBalanceQuantity = currentQuantity;

export async function postMovement(tx: Tx, line: MovementLine, actor?: InventoryActor) {
  if (line.idempotencyKey) {
    const existing = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: line.idempotencyKey } });
    if (existing) return existing;
  }
  const location = await tx.inventoryLocation.findUnique({ where: { id: line.locationId } });
  if (!location) throw new InventoryError("NOT_FOUND", "Lokasi gudang/toko tidak ditemukan.", 404);
  if (!location.isActive) throw new InventoryError("INVALID_STATE", `Lokasi ${location.name} tidak aktif.`, 409);

  const balance = await lockBalance(tx, line.productId, line.locationId);
  const next = applyDelta(balance, line.delta, line.unitCost);
  if (next.quantity < 0 && !(line.allowNegative ?? location.allowNegative)) {
    const product = await tx.inventoryProduct.findUnique({ where: { id: line.productId }, select: { sku: true, name: true } });
    throw new InventoryError(
      "INSUFFICIENT_STOCK",
      `Stok ${product?.name ?? line.productId} di ${location.name} tidak mencukupi (tersedia ${balance.quantity}, dibutuhkan ${Math.abs(line.delta)}).`,
      409,
      { productId: line.productId, sku: product?.sku, locationId: line.locationId, available: balance.quantity, requested: Math.abs(line.delta) }
    );
  }
  // Barang titipan bukan aset SLM: stoknya dicatat, nilainya tidak masuk lapisan FIFO / buku besar.
  const ownership = (await tx.inventoryProduct.findUnique({ where: { id: line.productId }, select: { ownership: true } }))?.ownership;
  const valued = line.type !== "TRANSFER_IN" && line.type !== "TRANSFER_OUT" && ownership !== "CONSIGNMENT";
  // Lapisan saldo awal dibuat dari stok sebelum pergerakan ini, jadi harus sebelum saldo diperbarui.
  const hadLayersBefore = valued ? (await ensureOpeningLayer(tx, line.productId)) || (await productHasLayers(tx, line.productId)) : true;
  await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: next.quantity, avgCost: next.avgCost } });
  const movement = await tx.inventoryMovement.create({
    data: {
      movementDate: line.movementDate,
      type: line.type,
      productId: line.productId,
      locationId: line.locationId,
      quantity: round2(line.delta),
      balanceBefore: balance.quantity,
      balanceAfter: next.quantity,
      unitCost: line.delta > 0 && line.unitCost ? round2(line.unitCost) : balance.avgCost,
      referenceType: line.referenceType,
      referenceId: line.referenceId,
      referenceNumber: line.referenceNumber,
      idempotencyKey: line.idempotencyKey,
      notes: line.notes,
      createdByUserId: actor?.id,
      createdByName: actor?.name
    }
  });
  if (!valued) return movement;
  const v = await valueMovement(
    tx,
    { id: movement.id, productId: line.productId, type: line.type, quantity: round2(line.delta), movementDate: line.movementDate },
    { unitCost: line.delta > 0 ? line.unitCost : undefined, layerSource: line.layerSource, hadLayersBefore }
  );
  return tx.inventoryMovement.update({
    where: { id: movement.id },
    data: { totalCost: v.totalCost, costComplete: v.complete, costNote: v.note, ...(line.delta < 0 ? { unitCost: v.unitCost } : {}) }
  });
}

function isDocumentNumberConflict(error: unknown) {
  const e = error as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && /Number/.test(String(e.meta?.target ?? ""));
}

/** Deadlock / konflik serialisasi Postgres: transaksi dibatalkan utuh, jadi aman diulang. */
function isRetryableConflict(error: unknown) {
  const e = error as { code?: string; message?: string; meta?: { code?: string } };
  return e?.code === "P2034" || e?.meta?.code === "40P01" || /40P01|deadlock detected/i.test(String(e?.message ?? ""));
}

/** Transaksi inventory; otomatis diulang bila nomor dokumen otomatis bentrok karena input bersamaan. */
export async function runInventoryTransaction<T>(fn: (tx: Tx) => Promise<T>, client: PrismaClient = prisma): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      if (attempt < 4 && (isDocumentNumberConflict(error) || isRetryableConflict(error))) continue;
      throw error;
    }
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Tanggal "YYYY-MM-DD" dari form digabung dengan jam saat ini agar urutan kartu stok tetap kronologis. */
export function parseDate(value?: string, now = new Date()) {
  if (!value) return now;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Tanggal dari form adalah tanggal WIB; gabungkan dengan jam WIB saat ini (server bisa UTC).
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: JAKARTA_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
    return new Date(`${value}T${time}+07:00`);
  }
  return new Date(value);
}

/**
 * Nomor dokumen PREFIX-YYYYMM-####. Dikunci dengan advisory lock per prefix+bulan
 * (dilepas saat transaksi selesai) sehingga input bersamaan tetap mendapat nomor unik.
 */
async function nextNumber(tx: Tx, prefix: string, date: Date, lastNumber: (startsWith: string) => Promise<string | undefined>) {
  const ym = jakartaMonthKey(date).replace("-", "");
  const start = `${prefix}-${ym}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory-doc:${start}`}))`;
  const last = await lastNumber(start);
  const seq = last ? Number(last.slice(start.length).replace(/\D.*$/, "")) || 0 : 0;
  return `${start}${String(seq + 1).padStart(4, "0")}`;
}

export async function resolveProduct(tx: Tx, ref: ProductRefInput) {
  const product = ref.productId
    ? await tx.inventoryProduct.findUnique({ where: { id: ref.productId } })
    : ref.sku
      ? await tx.inventoryProduct.findUnique({ where: { sku: ref.sku } })
      : await tx.inventoryProduct.findUnique({ where: { erpProductId: ref.erpProductId } });
  if (!product) {
    throw new InventoryError("NOT_FOUND", `Produk ${ref.sku || ref.productId || `ERP #${ref.erpProductId}`} tidak ditemukan di master inventory.`, 404, ref);
  }
  return product;
}

/** Terima ID lokasi atau kode lokasi (mis. "GD-UTAMA") supaya mudah dipakai klien API. */
async function requireLocation(tx: Tx, id: string) {
  const location = await tx.inventoryLocation.findFirst({ where: { OR: [{ id }, { code: id.trim().toUpperCase() }] } });
  if (!location) throw new InventoryError("NOT_FOUND", "Lokasi gudang/toko tidak ditemukan.", 404, { locationId: id });
  return location;
}

// ---------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------

export async function listLocations(options: { type?: "WAREHOUSE" | "STORE"; includeInactive?: boolean } = {}) {
  return prisma.inventoryLocation.findMany({
    where: { type: options.type, isActive: options.includeInactive ? undefined : true },
    orderBy: [{ type: "asc" }, { code: "asc" }]
  });
}

export async function createLocation(input: LocationInput) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.inventoryLocation.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    return tx.inventoryLocation.create({ data: input });
  });
}

export async function updateLocation(id: string, input: Partial<LocationInput>) {
  return prisma.$transaction(async (tx) => {
    await requireLocation(tx, id);
    if (input.isDefault) await tx.inventoryLocation.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
    return tx.inventoryLocation.update({ where: { id }, data: input });
  });
}

export async function listProducts(options: { keyword?: string; page?: number; pageSize?: number; includeInactive?: boolean } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize || 50)));
  const keyword = options.keyword?.trim();
  const where: Prisma.InventoryProductWhereInput = {
    isActive: options.includeInactive ? undefined : true,
    ...(keyword
      ? { OR: [{ sku: { contains: keyword, mode: "insensitive" } }, { name: { contains: keyword, mode: "insensitive" } }, { barcode: { contains: keyword, mode: "insensitive" } }] }
      : {})
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryProduct.count({ where }),
    prisma.inventoryProduct.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { balances: { select: { quantity: true } } } })
  ]);
  return {
    data: rows.map(({ balances, ...p }) => {
      const totalQuantity = round2(balances.reduce((s, b) => s + num(b.quantity), 0));
      return { ...serializeProduct(p), totalQuantity, totalKoliText: koliInfo(totalQuantity, p.unitsPerKoli, p.unit).koliText };
    }),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  };
}

export async function getProduct(idOrSku: string) {
  const product = await prisma.inventoryProduct.findFirst({
    where: { OR: [{ id: idOrSku }, { sku: idOrSku }] },
    include: { balances: { include: { location: true }, orderBy: { location: { code: "asc" } } } }
  });
  if (!product) throw new InventoryError("NOT_FOUND", "Produk tidak ditemukan.", 404);
  const { balances, ...rest } = product;
  return {
    ...serializeProduct(rest),
    totalQuantity: round2(balances.reduce((s, b) => s + num(b.quantity), 0)),
    stocks: balances.map((b) => ({ locationId: b.locationId, locationCode: b.location.code, locationName: b.location.name, locationType: b.location.type, quantity: num(b.quantity), avgCost: num(b.avgCost), ...koliInfo(num(b.quantity), rest.unitsPerKoli, rest.unit) }))
  };
}

export async function createProduct(input: ProductInput, actor?: InventoryActor) {
  const { initialStock, ...raw } = input;
  const data = await applyRmbCost(raw);
  return runInventoryTransaction(async (tx) => {
    const product = await tx.inventoryProduct.create({ data });
    for (let index = 0, list = (initialStock ?? []); index < list.length; index++) {
      const line = list[index];
      if (!line.quantity) continue;
      await postMovement(tx, {
        productId: product.id,
        locationId: line.locationId,
        delta: line.quantity,
        unitCost: line.unitCost ?? data.costPrice,
        type: "INITIAL",
        movementDate: new Date(),
        referenceType: "INITIAL",
        referenceId: product.id,
        referenceNumber: product.sku,
        idempotencyKey: `initial:${product.id}:${index}`,
        notes: "Stok awal"
      }, actor);
    }
    return serializeProduct(product);
  });
}

export async function updateProduct(idOrSku: string, input: Partial<Omit<ProductInput, "initialStock">>) {
  const product = await prisma.inventoryProduct.findFirst({ where: { OR: [{ id: idOrSku }, { sku: idOrSku }] } });
  if (!product) throw new InventoryError("NOT_FOUND", "Produk tidak ditemukan.", 404);
  if (input.ownership && input.ownership !== product.ownership) {
    // Ganti kepemilikan saat masih ada stok akan memindahkan nilai keluar/masuk persediaan tanpa dokumen.
    const onHand = await prisma.inventoryBalance.aggregate({ where: { productId: product.id }, _sum: { quantity: true } });
    if (num(onHand._sum.quantity) !== 0) {
      throw new InventoryError("INVALID_STATE", `Kepemilikan ${product.sku} hanya bisa diganti saat stoknya 0 (sekarang ${num(onHand._sum.quantity)}).`, 409);
    }
  }
  if (input.ownership === "OWN") input = { ...input, consignorName: undefined };
  const data = await applyRmbCost(input, {
    priceRmb: product.priceRmb == null ? null : num(product.priceRmb),
    extraCostIdr: num(product.extraCostIdr),
    cbmPerUnit: product.cbmPerUnit == null ? null : num(product.cbmPerUnit),
    cbmRateIdr: product.cbmRateIdr == null ? null : num(product.cbmRateIdr)
  });
  return serializeProduct(await prisma.inventoryProduct.update({
    where: { id: product.id },
    data: { ...data, ...(input.ownership === "OWN" ? { consignorName: null } : {}) }
  }));
}

function serializeProduct<T extends { minimumStock: Prisma.Decimal; costPrice: Prisma.Decimal; sellingPrice: Prisma.Decimal; unitsPerKoli: Prisma.Decimal | null; priceRmb: Prisma.Decimal | null; extraCostIdr: Prisma.Decimal; cbmPerUnit?: Prisma.Decimal | null; cbmRateIdr?: Prisma.Decimal | null }>(p: T) {
  return {
    ...p,
    cbmPerUnit: p.cbmPerUnit == null ? null : num(p.cbmPerUnit),
    cbmRateIdr: p.cbmRateIdr == null ? null : num(p.cbmRateIdr),
    minimumStock: num(p.minimumStock),
    costPrice: num(p.costPrice),
    sellingPrice: num(p.sellingPrice),
    unitsPerKoli: p.unitsPerKoli == null ? null : num(p.unitsPerKoli),
    priceRmb: p.priceRmb == null ? null : num(p.priceRmb),
    extraCostIdr: num(p.extraCostIdr)
  };
}

/** Qty satuan dari item dokumen (qty langsung atau koli × isi/koli + lepas). */
type KoliItem = { quantity?: number | null; countedQty?: number | null; koli?: number | null; loose?: number | null; unitsPerKoli?: number | null };

function itemQuantity(product: { sku: string; unitsPerKoli: Prisma.Decimal | null }, item: KoliItem, field: "quantity" | "countedQty" = "quantity") {
  const perKoli = product.unitsPerKoli == null ? null : num(product.unitsPerKoli);
  // Isi per koli hanya diatur di Master Barang; dokumen stok tidak boleh mengubahnya.
  if (item.unitsPerKoli != null && item.unitsPerKoli !== perKoli) {
    throw new InventoryError("VALIDATION", `Isi per koli ${product.sku} hanya bisa diubah di Master Barang (sekarang: ${perKoli ?? "belum diatur"}).`, 400, { sku: product.sku });
  }
  const qty = qtyFromKoli({ quantity: item[field], koli: item.koli, loose: item.loose }, perKoli);
  if (qty == null) throw new InventoryError("VALIDATION", `Isi per koli ${product.sku} belum diatur di Master Barang. Masukkan jumlah di kolom Lepas, atau minta Super Admin mengisi isi per koli.`, 400, { sku: product.sku });
  return qty;
}


function koliInfo(quantity: number, unitsPerKoli: Prisma.Decimal | number | null, unit: string) {
  const perKoli = unitsPerKoli == null ? null : num(unitsPerKoli);
  const split = splitKoli(quantity, perKoli);
  return { unitsPerKoli: perKoli, koli: split?.koli ?? null, loose: split?.loose ?? null, koliText: formatKoli(quantity, perKoli, unit) };
}

// ---------------------------------------------------------------------
// Stock queries
// ---------------------------------------------------------------------

export type BalanceQuery = {
  locationId?: string;
  locationType?: "WAREHOUSE" | "STORE";
  productId?: string;
  sku?: string;
  keyword?: string;
  lowStockOnly?: boolean;
  includeZero?: boolean;
  page?: number;
  pageSize?: number;
  /** Ambil semua baris tanpa paginasi (untuk laporan & ekspor). */
  all?: boolean;
};

export async function listBalances(query: BalanceQuery = {}) {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(5000, Math.max(1, Math.floor(query.pageSize || 50)));
  const keyword = query.keyword?.trim();
  const where: Prisma.InventoryBalanceWhereInput = {
    locationId: query.locationId,
    productId: query.productId,
    quantity: query.includeZero ? undefined : { not: 0 },
    location: { type: query.locationType, isActive: true },
    product: {
      sku: query.sku,
      ...(keyword ? { OR: [{ sku: { contains: keyword, mode: "insensitive" } }, { name: { contains: keyword, mode: "insensitive" } }] } : {})
    }
  };
  const rows = await prisma.inventoryBalance.findMany({
    where,
    include: { product: true, location: true },
    orderBy: [{ product: { name: "asc" } }, { location: { code: "asc" } }]
  });
  const mapped = rows.map((b) => {
    const quantity = num(b.quantity);
    const minimumStock = num(b.product.minimumStock);
    return {
      id: b.id,
      productId: b.productId,
      sku: b.product.sku,
      productName: b.product.name,
      unit: b.product.unit,
      erpProductId: b.product.erpProductId,
      locationId: b.locationId,
      locationCode: b.location.code,
      locationName: b.location.name,
      locationType: b.location.type,
      erpWarehouseId: b.location.erpWarehouseId,
      quantity,
      avgCost: num(b.avgCost),
      stockValue: round2(quantity * num(b.avgCost)),
      ...koliInfo(quantity, b.product.unitsPerKoli, b.product.unit),
      minimumStock,
      costPrice: num(b.product.costPrice),
      sellingPrice: num(b.product.sellingPrice),
      category: b.product.category,
      isLowStock: minimumStock > 0 && quantity <= minimumStock,
      updatedAt: b.updatedAt.toISOString()
    };
  });
  const filtered = query.lowStockOnly ? mapped.filter((r) => r.isLowStock) : mapped;
  const total = filtered.length;
  return {
    data: query.all ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  };
}

/**
 * Matriks stok per produk × lokasi (gudang & toko) dalam satu tabel.
 * Urutan: barang yang masih ada stoknya di lokasi terpilih, dari yang paling sedikit
 * (dalam koli bila isi per koli diketahui), lalu barang dengan stok 0 di paling bawah.
 * `lowStock` = stok ≤ 1 koli (atau ≤ minimum stok bila isi koli belum diatur).
 */
export async function stockMatrix(query: { keyword?: string; locationType?: "WAREHOUSE" | "STORE"; page?: number; pageSize?: number; hideZero?: boolean; missingName?: boolean } = {}) {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(query.pageSize || 50)));
  const locations = await listLocations({ type: query.locationType });
  const locationIds = locations.map((l) => l.id);
  const keyword = query.keyword?.trim();
  const like = keyword ? `%${keyword}%` : null;
  const scope = locationIds.length ? Prisma.sql`b."locationId" IN (${Prisma.join(locationIds)})` : Prisma.sql`FALSE`;
  const keywordSql = like ? Prisma.sql`AND (p."sku" ILIKE ${like} OR p."name" ILIKE ${like} OR p."barcode" ILIKE ${like})` : Prisma.empty;
  // Sama dengan hasRealName(): nama kosong atau hanya mengulang kode.
  const missingNameSql = query.missingName
    ? Prisma.sql`AND (btrim(p."name") = '' OR regexp_replace(lower(p."name"), '[^a-z0-9]', '', 'g') = regexp_replace(lower(p."sku"), '[^a-z0-9]', '', 'g'))`
    : Prisma.empty;
  const base = Prisma.sql`
    SELECT p."id", p."name",
      COALESCE(SUM(b."quantity") FILTER (WHERE ${scope}), 0) AS "total",
      COALESCE(NULLIF(p."unitsPerKoli", 0), 1) AS "perKoli"
    FROM "InventoryProduct" p
    LEFT JOIN "InventoryBalance" b ON b."productId" = p."id"
    WHERE p."isActive" = TRUE ${keywordSql} ${missingNameSql}
    GROUP BY p."id"`;
  const having = query.hideZero ? Prisma.sql`WHERE t."total" > 0` : Prisma.empty;
  const [countRows, ordered] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS "count" FROM (${base}) t ${having}`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT t."id" FROM (${base}) t ${having}
      ORDER BY (t."total" <= 0), t."total" / t."perKoli", t."name"
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const ids = ordered.map((r) => r.id);
  const [products, balances] = ids.length
    ? await Promise.all([
        prisma.inventoryProduct.findMany({ where: { id: { in: ids } } }),
        prisma.inventoryBalance.findMany({ where: { productId: { in: ids }, location: { isActive: true } }, include: { location: { select: { type: true } } } })
      ])
    : [[], []];
  const productById = new Map(products.map((p) => [p.id, serializeProduct(p)]));
  const byKey = new Map(balances.map((b) => [`${b.productId}:${b.locationId}`, num(b.quantity)]));
  return {
    locations: locations.map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type })),
    data: ids.map((id) => {
      const p = productById.get(id)!;
      const perLocation = Object.fromEntries(locations.map((l) => [l.id, byKey.get(`${p.id}:${l.id}`) ?? 0]));
      // Total gudang & toko selalu dari semua lokasi aktif, tidak ikut filter kolom.
      const own = balances.filter((b) => b.productId === p.id);
      const warehouseTotal = own.filter((b) => b.location.type === "WAREHOUSE").reduce((s, b) => s + num(b.quantity), 0);
      const storeTotal = own.filter((b) => b.location.type === "STORE").reduce((s, b) => s + num(b.quantity), 0);
      const perLocationKoli = Object.fromEntries(locations.map((l) => [l.id, koliInfo(perLocation[l.id], p.unitsPerKoli, p.unit).koliText]));
      const sum = round2(warehouseTotal + storeTotal);
      // Penanda merah & urutan memakai stok di lokasi yang sedang ditampilkan.
      const scopeTotal = round2(locations.reduce((s, l) => s + perLocation[l.id], 0));
      const lowStock = scopeTotal > 0 && (p.unitsPerKoli ? scopeTotal <= p.unitsPerKoli : p.minimumStock > 0 && scopeTotal <= p.minimumStock);
      return { productId: p.id, sku: p.sku, name: p.name, category: p.category, photoUrl: p.photoUrl, hasName: hasRealName(p.name, p.sku), unit: p.unit, unitsPerKoli: p.unitsPerKoli, minimumStock: p.minimumStock, perLocation, perLocationKoli,
        warehouseKoliText: koliInfo(warehouseTotal, p.unitsPerKoli, p.unit).koliText, storeKoliText: koliInfo(storeTotal, p.unitsPerKoli, p.unit).koliText, totalKoliText: koliInfo(sum, p.unitsPerKoli, p.unit).koliText,
        warehouseTotal: round2(warehouseTotal), storeTotal: round2(storeTotal), total: sum, scopeTotal, lowStock };
    }),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  };
}

export type MovementQuery = {
  productId?: string;
  sku?: string;
  locationId?: string;
  type?: InventoryMovementType;
  referenceNumber?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** Kartu stok / mutasi stok. */
export async function listMovements(query: MovementQuery = {}) {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(500, Math.max(1, Math.floor(query.pageSize || 50)));
  const to = query.to ? new Date(query.to) : undefined;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(query.to!)) to.setUTCHours(23, 59, 59, 999);
  const where: Prisma.InventoryMovementWhereInput = {
    productId: query.productId,
    product: query.sku ? { sku: query.sku } : undefined,
    locationId: query.locationId,
    type: query.type,
    referenceNumber: query.referenceNumber ? { contains: query.referenceNumber, mode: "insensitive" } : undefined,
    movementDate: query.from || to ? { gte: query.from ? new Date(query.from) : undefined, lte: to } : undefined
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      include: { product: { select: { sku: true, name: true, unit: true, unitsPerKoli: true } }, location: { select: { code: true, name: true, type: true } } },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return {
    data: rows.map((m) => ({
      id: m.id,
      movementDate: m.movementDate.toISOString(),
      type: m.type,
      productId: m.productId,
      sku: m.product.sku,
      productName: m.product.name,
      unit: m.product.unit,
      locationId: m.locationId,
      locationCode: m.location.code,
      locationName: m.location.name,
      locationType: m.location.type,
      quantityIn: num(m.quantity) > 0 ? num(m.quantity) : 0,
      quantityOut: num(m.quantity) < 0 ? -num(m.quantity) : 0,
      quantity: num(m.quantity),
      balanceBefore: num(m.balanceBefore),
      balanceAfter: num(m.balanceAfter),
      quantityKoliText: koliInfo(Math.abs(num(m.quantity)), m.product.unitsPerKoli, m.product.unit).koliText,
      balanceKoliText: koliInfo(num(m.balanceAfter), m.product.unitsPerKoli, m.product.unit).koliText,
      unitCost: num(m.unitCost),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      referenceNumber: m.referenceNumber,
      notes: m.notes,
      createdByName: m.createdByName,
      createdAt: m.createdAt.toISOString()
    })),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  };
}

// ---------------------------------------------------------------------
// Transfer antar gudang / toko
// ---------------------------------------------------------------------

export async function createTransfer(input: TransferInput, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.inventoryTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (existing) return existing;
    }
    const from = await requireLocation(tx, input.fromLocationId);
    const to = await requireLocation(tx, input.toLocationId);
    if (from.id === to.id) throw new InventoryError("VALIDATION", "Lokasi asal dan tujuan tidak boleh sama.");
    const date = parseDate(input.transferDate);
    const transferNumber = input.transferNumber || await nextNumber(tx, "TRF", date, async (s) => (await tx.inventoryTransfer.findFirst({ where: { transferNumber: { startsWith: s } }, orderBy: { transferNumber: "desc" }, select: { transferNumber: true } }))?.transferNumber);
    const products: Awaited<ReturnType<typeof resolveProduct>>[] = [];
    for (const item of input.items) products.push(await resolveProduct(tx, item));
    const quantities = input.items.map((item, i) => itemQuantity(products[i], item));
    const badQty = quantities.findIndex((q) => !(q > 0));
    if (badQty >= 0) throw new InventoryError("VALIDATION", `Qty transfer ${products[badQty].sku} harus lebih dari 0.`);

    const transfer = await tx.inventoryTransfer.create({
      data: {
        transferNumber,
        transferDate: date,
        fromLocationId: from.id,
        toLocationId: to.id,
        status: input.receiveNow ? "RECEIVED" : "IN_TRANSIT",
        receivedAt: input.receiveNow ? date : null,
        receivedByName: input.receiveNow ? actor?.name : null,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: actor?.id,
        createdByName: actor?.name,
        items: { create: input.items.map((item, i) => ({ productId: products[i].id, quantity: quantities[i], notes: item.notes })) }
      },
      include: { items: true }
    });

    for (let i = 0, list = transfer.items; i < list.length; i++) {
      const item = list[i];
      const out = await postMovement(tx, {
        productId: item.productId, locationId: from.id, delta: -num(item.quantity), type: "TRANSFER_OUT", movementDate: date,
        referenceType: "TRANSFER", referenceId: transfer.id, referenceNumber: transferNumber,
        idempotencyKey: `transfer:${transfer.id}:out:${i}`, notes: `Transfer ke ${to.name}`
      }, actor);
      if (input.receiveNow) {
        await postMovement(tx, {
          productId: item.productId, locationId: to.id, delta: num(item.quantity), unitCost: num(out.unitCost), type: "TRANSFER_IN", movementDate: date,
          referenceType: "TRANSFER", referenceId: transfer.id, referenceNumber: transferNumber,
          idempotencyKey: `transfer:${transfer.id}:in:${i}`, notes: `Transfer dari ${from.name}`
        }, actor);
      }
    }
    return transfer;
  });
}

export async function receiveTransfer(id: string, actor?: InventoryActor, receivedDate?: string) {
  return runInventoryTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryTransfer" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw new InventoryError("NOT_FOUND", "Transfer tidak ditemukan.", 404);
    const transfer = await tx.inventoryTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (transfer.status !== "IN_TRANSIT") throw new InventoryError("INVALID_STATE", `Transfer berstatus ${transfer.status}, tidak bisa diterima.`, 409);
    const date = parseDate(receivedDate);
    const from = await requireLocation(tx, transfer.fromLocationId);
    for (let i = 0, list = transfer.items; i < list.length; i++) {
      const item = list[i];
      const out = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: `transfer:${transfer.id}:out:${i}` } });
      await postMovement(tx, {
        productId: item.productId, locationId: transfer.toLocationId, delta: num(item.quantity), unitCost: num(out?.unitCost), type: "TRANSFER_IN", movementDate: date,
        referenceType: "TRANSFER", referenceId: transfer.id, referenceNumber: transfer.transferNumber,
        idempotencyKey: `transfer:${transfer.id}:in:${i}`, notes: `Transfer dari ${from.name}`
      }, actor);
    }
    return tx.inventoryTransfer.update({ where: { id }, data: { status: "RECEIVED", receivedAt: date, receivedByName: actor?.name }, include: { items: true } });
  });
}

export async function cancelTransfer(id: string, actor?: InventoryActor, reason?: string) {
  return runInventoryTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryTransfer" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw new InventoryError("NOT_FOUND", "Transfer tidak ditemukan.", 404);
    const transfer = await tx.inventoryTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (transfer.status !== "IN_TRANSIT") throw new InventoryError("INVALID_STATE", "Hanya transfer yang masih dalam perjalanan yang bisa dibatalkan.", 409);
    for (let i = 0, list = transfer.items; i < list.length; i++) {
      const item = list[i];
      await postMovement(tx, {
        productId: item.productId, locationId: transfer.fromLocationId, delta: num(item.quantity), type: "TRANSFER_IN", movementDate: new Date(),
        referenceType: "TRANSFER_CANCEL", referenceId: transfer.id, referenceNumber: transfer.transferNumber,
        idempotencyKey: `transfer:${transfer.id}:cancel:${i}`, notes: `Pembatalan transfer${reason ? `: ${reason}` : ""}`
      }, actor);
    }
    return tx.inventoryTransfer.update({ where: { id }, data: { status: "CANCELLED", notes: [transfer.notes, reason && `Dibatalkan: ${reason}`].filter(Boolean).join("\n") || null }, include: { items: true } });
  });
}

export async function listTransfers(query: { status?: "IN_TRANSIT" | "RECEIVED" | "CANCELLED"; locationId?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize || 30));
  const where: Prisma.InventoryTransferWhereInput = {
    status: query.status,
    ...(query.locationId ? { OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryTransfer.count({ where }),
    prisma.inventoryTransfer.findMany({ where, include: { items: true }, orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize })
  ]);
  return { data: await decorateDocuments(rows), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// ---------------------------------------------------------------------
// Stock opname (mengganti stok sistem dengan hasil hitung fisik)
// ---------------------------------------------------------------------

export async function createOpname(input: OpnameInput, actor?: InventoryActor) {
  const opname = await createOpnameRecord(input, actor);
  await postInventoryDocumentJournalSafely("OPNAME", opname.id);
  return opname;
}

async function createOpnameRecord(input: OpnameInput, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.inventoryOpname.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (existing) return existing;
    }
    const location = await requireLocation(tx, input.locationId);
    const date = parseDate(input.opnameDate);
    const opnameNumber = input.opnameNumber || await nextNumber(tx, "SOP", date, async (s) => (await tx.inventoryOpname.findFirst({ where: { opnameNumber: { startsWith: s } }, orderBy: { opnameNumber: "desc" }, select: { opnameNumber: true } }))?.opnameNumber);
    const lines = [];
    const seen = new Set<string>();
    for (const item of input.items) {
      const product = await resolveProduct(tx, item);
      if (seen.has(product.id)) throw new InventoryError("VALIDATION", `Produk ${product.sku} tercantum lebih dari sekali dalam opname.`);
      seen.add(product.id);
      const systemQty = await currentQuantity(tx, product.id, location.id);
      const counted = itemQuantity(product, item, "countedQty");
      if (counted < 0) throw new InventoryError("VALIDATION", `Qty fisik ${product.sku} tidak boleh negatif.`);
      lines.push({ productId: product.id, systemQty, countedQty: counted, differenceQty: round2(counted - systemQty), notes: item.notes, unitCost: num(product.costPrice) });
    }
    const opname = await tx.inventoryOpname.create({
      data: {
        opnameNumber, opnameDate: date, locationId: location.id, notes: input.notes, idempotencyKey: input.idempotencyKey,
        createdByUserId: actor?.id, createdByName: actor?.name, items: { create: lines.map(({ unitCost: _unitCost, ...line }) => line) }
      },
      include: { items: true }
    });
    for (let i = 0, list = lines; i < list.length; i++) {
      const line = list[i];
      if (line.differenceQty === 0) continue;
      await postMovement(tx, {
        productId: line.productId, locationId: location.id, delta: line.differenceQty, type: "OPNAME", movementDate: date,
        referenceType: "OPNAME", referenceId: opname.id, referenceNumber: opnameNumber, allowNegative: true,
        unitCost: line.unitCost, idempotencyKey: `opname:${opname.id}:${i}`, notes: `Opname: sistem ${line.systemQty} → fisik ${line.countedQty}`
      }, actor);
    }
    return opname;
  });
}

export async function listOpnames(query: { locationId?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize || 30));
  const where = { locationId: query.locationId };
  const [total, rows] = await Promise.all([
    prisma.inventoryOpname.count({ where }),
    prisma.inventoryOpname.findMany({ where, include: { items: true }, orderBy: [{ opnameDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize })
  ]);
  return { data: await decorateDocuments(rows), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// ---------------------------------------------------------------------
// Stock adjustment (menambah / mengurangi stok yang ada)
// ---------------------------------------------------------------------

export async function createAdjustment(input: AdjustmentInput, actor?: InventoryActor) {
  const adjustment = await createAdjustmentRecord(input, actor);
  await postInventoryDocumentJournalSafely("ADJUSTMENT", adjustment.id);
  return adjustment;
}

async function createAdjustmentRecord(input: AdjustmentInput, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (existing) return existing;
    }
    const location = await requireLocation(tx, input.locationId);
    const date = parseDate(input.adjustmentDate);
    const adjustmentNumber = input.adjustmentNumber || await nextNumber(tx, "ADJ", date, async (s) => (await tx.inventoryAdjustment.findFirst({ where: { adjustmentNumber: { startsWith: s } }, orderBy: { adjustmentNumber: "desc" }, select: { adjustmentNumber: true } }))?.adjustmentNumber);
    const products: Awaited<ReturnType<typeof resolveProduct>>[] = [];
    for (const item of input.items) products.push(await resolveProduct(tx, item));
    const quantities = input.items.map((item, i) => itemQuantity(products[i], item));
    const zero = quantities.findIndex((q) => q === 0);
    if (zero >= 0) throw new InventoryError("VALIDATION", `Qty adjustment ${products[zero].sku} tidak boleh 0.`);
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        adjustmentNumber, adjustmentDate: date, locationId: location.id, reason: input.reason, notes: input.notes, idempotencyKey: input.idempotencyKey,
        createdByUserId: actor?.id, createdByName: actor?.name,
        items: { create: input.items.map((item, i) => ({ productId: products[i].id, quantity: quantities[i], unitCost: item.unitCost ?? 0, notes: item.notes })) }
      },
      include: { items: true }
    });
    for (let i = 0, list = input.items; i < list.length; i++) {
      const item = list[i];
      await postMovement(tx, {
        productId: products[i].id, locationId: location.id, delta: quantities[i], unitCost: item.unitCost ?? num(products[i].costPrice),
        type: quantities[i] > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", movementDate: date,
        referenceType: "ADJUSTMENT", referenceId: adjustment.id, referenceNumber: adjustmentNumber,
        idempotencyKey: `adjustment:${adjustment.id}:${i}`, notes: item.notes || input.reason
      }, actor);
    }
    return adjustment;
  });
}

export async function listAdjustments(query: { locationId?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize || 30));
  const where = { locationId: query.locationId };
  const [total, rows] = await Promise.all([
    prisma.inventoryAdjustment.count({ where }),
    prisma.inventoryAdjustment.findMany({ where, include: { items: true }, orderBy: [{ adjustmentDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize })
  ]);
  return { data: await decorateDocuments(rows), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// ---------------------------------------------------------------------
// Barang masuk (pembelian / penerimaan tanpa PO)
// ---------------------------------------------------------------------

export async function createStockIn(input: StockInInput, actor?: InventoryActor) {
  const result = await runInventoryTransaction(async (tx) => {
    const location = await requireLocation(tx, input.locationId);
    const date = parseDate(input.movementDate);
    const referenceNumber = input.referenceNumber || `IN-${date.toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`;
    // Identitas dokumen untuk jurnal; sama untuk permintaan ulang dengan idempotencyKey yang sama.
    const documentId = input.idempotencyKey ? `key:${input.idempotencyKey}` : crypto.randomUUID();
    const movements = [];
    for (let i = 0, list = input.items; i < list.length; i++) {
      const item = list[i];
      const product = await resolveProduct(tx, item);
      const quantity = itemQuantity(product, item);
      if (!(quantity > 0)) throw new InventoryError("VALIDATION", `Qty masuk ${product.sku} harus lebih dari 0.`);
      movements.push(await postMovement(tx, {
        productId: product.id, locationId: location.id, delta: quantity, unitCost: item.unitCost ?? num(product.costPrice),
        type: "PURCHASE_RECEIPT", movementDate: date, referenceType: "STOCK_IN", referenceId: documentId, referenceNumber,
        idempotencyKey: input.idempotencyKey ? `stock-in:${input.idempotencyKey}:${i}` : undefined, notes: item.notes || input.notes
      }, actor));
    }
    return { referenceNumber, documentId: movements[0]?.referenceId ?? documentId, locationId: location.id, movements: movements.map((m) => ({ id: m.id, productId: m.productId, quantity: num(m.quantity), balanceAfter: num(m.balanceAfter) })) };
  });
  await postInventoryDocumentJournalSafely("STOCK_IN", result.documentId);
  return result;
}

/** Posting penerimaan barang pembelian (GRN) ke lokasi inventory. Aman diulang (idempotent). */
export async function postPurchaseReceiptToInventory(receiptId: string, locationId: string, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    const receipt = await tx.purchaseReceipt.findUnique({
      where: { id: receiptId },
      include: { items: { include: { purchaseOrderItem: true } }, purchaseOrder: { select: { poNumber: true } } }
    });
    if (!receipt) throw new InventoryError("NOT_FOUND", "Penerimaan barang (GRN) tidak ditemukan.", 404);
    const location = await requireLocation(tx, locationId);
    for (const item of receipt.items) {
      const qty = num(item.quantityReceived);
      if (qty <= 0) continue;
      const unitCost = num(item.purchaseOrderItem?.unitPriceIdr);
      const product = await tx.inventoryProduct.upsert({
        where: { sku: item.itemCode },
        create: { sku: item.itemCode, name: item.itemName, unit: item.unit?.trim() || DEFAULT_UNIT, costPrice: unitCost },
        update: {}
      });
      // Qty & harga GRN mengikuti satuan di PO. Satuan beda (mis. PCS vs Lusin) berarti angka
      // salah skala, jadi ditolak daripada mencatat stok 12x lipat.
      const grnUnit = item.unit?.trim();
      if (grnUnit && grnUnit.toLowerCase() !== product.unit.toLowerCase()) {
        throw new InventoryError(
          "VALIDATION",
          `Satuan di PO untuk ${item.itemCode} adalah ${grnUnit}, sedangkan di Master Barang ${product.unit}. Samakan satuan PO dengan Master Barang lalu ulangi.`,
          400,
          { sku: item.itemCode, grnUnit, productUnit: product.unit }
        );
      }
      await postMovement(tx, {
        productId: product.id, locationId: location.id, delta: qty, unitCost, type: "PURCHASE_RECEIPT", movementDate: receipt.receiptDate,
        referenceType: "PURCHASE_RECEIPT", referenceId: receipt.id, referenceNumber: receipt.grnNumber,
        idempotencyKey: `grn:${receipt.id}:${item.id}`, notes: `GRN ${receipt.grnNumber} / PO ${receipt.purchaseOrder.poNumber}`
      }, actor);
    }
    return tx.purchaseReceipt.update({ where: { id: receipt.id }, data: { inventoryLocationId: location.id, inventoryPostedAt: new Date(), warehouseName: location.name } });
  });
}

// ---------------------------------------------------------------------
// Penjualan (dipakai bila INVENTORY_SOURCE=local)
// ---------------------------------------------------------------------

export type SaleStockItem = { productId?: string; productRef?: string; warehouseId?: string; quantity: number; allowNegative?: boolean };

async function resolveSaleProduct(tx: Tx, item: SaleStockItem) {
  const erpId = item.productId && /^\d+$/.test(item.productId) ? Number(item.productId) : undefined;
  const product =
    (erpId ? await tx.inventoryProduct.findUnique({ where: { erpProductId: erpId } }) : null) ??
    (item.productId ? await tx.inventoryProduct.findUnique({ where: { id: item.productId } }) : null) ??
    (item.productRef ? await tx.inventoryProduct.findUnique({ where: { sku: item.productRef } }) : null);
  if (!product) throw new InventoryError("NOT_FOUND", `Produk ${item.productRef || item.productId} tidak ditemukan di master inventory SLM.`, 404, item);
  return product;
}

async function resolveSaleLocation(tx: Tx, warehouseId?: string) {
  const erpId = warehouseId && /^\d+$/.test(warehouseId) ? Number(warehouseId) : undefined;
  const location =
    (erpId ? await tx.inventoryLocation.findUnique({ where: { erpWarehouseId: erpId } }) : null) ??
    (warehouseId ? await tx.inventoryLocation.findFirst({ where: { OR: [{ id: warehouseId }, { code: warehouseId.toUpperCase() }] } }) : null) ??
    (process.env.INVENTORY_DEFAULT_LOCATION_CODE ? await tx.inventoryLocation.findUnique({ where: { code: process.env.INVENTORY_DEFAULT_LOCATION_CODE.toUpperCase() } }) : null) ??
    (await tx.inventoryLocation.findFirst({ where: { isDefault: true, isActive: true } }));
  if (!location) throw new InventoryError("NOT_FOUND", "Lokasi stok untuk penjualan tidak ditemukan. Atur lokasi default di Inventory > Gudang & Toko.", 404);
  return location;
}

export async function releaseSaleStockLocal(input: { reference: string; saleDate: string; sourceNumber?: string; items: SaleStockItem[] }, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    const already = await tx.inventoryMovement.findFirst({ where: { referenceType: "SALE", referenceNumber: input.reference } });
    if (already) return { status: "already_released" as const };
    const date = parseDate(input.saleDate);
    const lines = [];
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const product = await resolveSaleProduct(tx, item);
      const location = await resolveSaleLocation(tx, item.warehouseId);
      lines.push({ index: i, productId: product.id, locationId: location.id, quantity: item.quantity, allowNegative: item.allowNegative });
    }
    // Urutan kunci yang konsisten mencegah deadlock antar penjualan paralel.
    lines.sort((a, b) => `${a.productId}:${a.locationId}`.localeCompare(`${b.productId}:${b.locationId}`));
    for (const line of lines) {
      await postMovement(tx, {
        productId: line.productId, locationId: line.locationId, delta: -Math.abs(line.quantity), type: "SALE_OUT", movementDate: date, allowNegative: line.allowNegative || undefined,
        referenceType: "SALE", referenceNumber: input.reference, idempotencyKey: `sale:${input.reference}:${line.index}`,
        notes: `Penjualan ${input.sourceNumber || input.reference}`
      }, actor);
    }
    return { status: "released" as const };
  });
}

export async function cancelSaleStockLocal(input: { reference: string; reason: string }, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    const movements = await tx.inventoryMovement.findMany({ where: { referenceType: "SALE", referenceNumber: input.reference }, orderBy: { createdAt: "asc" } });
    for (const m of movements) {
      await postMovement(tx, {
        productId: m.productId, locationId: m.locationId, delta: -num(m.quantity), unitCost: num(m.unitCost), type: "SALE_REVERSAL", movementDate: new Date(),
        referenceType: "SALE_REVERSAL", referenceId: m.id, referenceNumber: input.reference, idempotencyKey: `sale-rev:${m.id}`,
        allowNegative: true, notes: `Pembatalan: ${input.reason}`
      }, actor);
    }
    return { status: "reversed" as const };
  });
}

// ---------------------------------------------------------------------
// Dekorasi dokumen (nama lokasi & produk)
// ---------------------------------------------------------------------

type DocWithItems = { items: { productId: string; quantity?: Prisma.Decimal; systemQty?: Prisma.Decimal; countedQty?: Prisma.Decimal; differenceQty?: Prisma.Decimal; unitCost?: Prisma.Decimal }[]; locationId?: string; fromLocationId?: string; toLocationId?: string };

type DecoratedItem<I> = Omit<I, "quantity" | "systemQty" | "countedQty" | "differenceQty" | "unitCost"> & {
  quantity?: number; systemQty?: number; countedQty?: number; differenceQty?: number; unitCost?: number; sku?: string; productName?: string; unit?: string; koliText?: string;
};
type LocationSummary = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE" };
export type DecoratedDocument<T extends DocWithItems> = Omit<T, "items"> & {
  items: DecoratedItem<T["items"][number]>[];
  location?: LocationSummary;
  fromLocation?: LocationSummary;
  toLocation?: LocationSummary;
};

async function decorateDocuments<T extends DocWithItems>(docs: T[]): Promise<DecoratedDocument<T>[]> {
  const productIds = Array.from(new Set(docs.flatMap((d) => d.items.map((i) => i.productId))));
  const locationIds = Array.from(new Set(docs.flatMap((d) => [d.locationId, d.fromLocationId, d.toLocationId].filter(Boolean) as string[])));
  const [products, locations] = await Promise.all([
    prisma.inventoryProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true, unit: true, unitsPerKoli: true } }),
    prisma.inventoryLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true, name: true, type: true } })
  ]);
  const p = new Map(products.map((x) => [x.id, x]));
  const l = new Map(locations.map((x) => [x.id, x]));
  return docs.map((d) => ({
    ...d,
    location: d.locationId ? l.get(d.locationId) : undefined,
    fromLocation: d.fromLocationId ? l.get(d.fromLocationId) : undefined,
    toLocation: d.toLocationId ? l.get(d.toLocationId) : undefined,
    items: d.items.map((i) => ({
      ...i,
      quantity: i.quantity != null ? num(i.quantity) : undefined,
      systemQty: i.systemQty != null ? num(i.systemQty) : undefined,
      countedQty: i.countedQty != null ? num(i.countedQty) : undefined,
      differenceQty: i.differenceQty != null ? num(i.differenceQty) : undefined,
      unitCost: i.unitCost != null ? num(i.unitCost) : undefined,
      sku: p.get(i.productId)?.sku,
      productName: p.get(i.productId)?.name,
      unit: p.get(i.productId)?.unit,
      koliText: (() => {
        const prod = p.get(i.productId);
        const q = i.quantity ?? i.countedQty;
        return prod && q != null ? koliInfo(num(q), prod.unitsPerKoli, prod.unit).koliText : undefined;
      })()
    }))
  })) as unknown as DecoratedDocument<T>[];
}

/** Daftar ringkas seluruh barang aktif untuk pilihan di form. */
export async function listProductOptions() {
  const rows = await prisma.inventoryProduct.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, unit: true, unitsPerKoli: true }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ ...r, unitsPerKoli: r.unitsPerKoli == null ? null : num(r.unitsPerKoli) }));
}

export async function listPendingPurchaseReceipts(limit = 50) {
  return prisma.purchaseReceipt.findMany({
    where: { inventoryPostedAt: null },
    include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } }, items: { select: { itemCode: true, itemName: true, quantityReceived: true, unit: true } } },
    orderBy: { receiptDate: "desc" },
    take: limit
  });
}

/** Retur penjualan: barang kembali ke lokasi stok asal penjualan. Aman diulang. */
export async function returnSaleStockLocal(input: { returnId: string; returnNumber: string; returnDate: string; items: (SaleStockItem & { lineId: string; unitCost?: number })[] }, actor?: InventoryActor) {
  return runInventoryTransaction(async (tx) => {
    const date = parseDate(input.returnDate);
    const lines = [];
    for (const item of input.items) {
      if (!(item.quantity > 0)) continue;
      const product = await resolveSaleProduct(tx, item);
      const location = await resolveSaleLocation(tx, item.warehouseId);
      lines.push({ lineId: item.lineId, productId: product.id, locationId: location.id, quantity: item.quantity, unitCost: item.unitCost });
    }
    lines.sort((a, b) => `${a.productId}:${a.locationId}`.localeCompare(`${b.productId}:${b.locationId}`));
    for (const line of lines) {
      await postMovement(tx, {
        productId: line.productId, locationId: line.locationId, delta: Math.abs(line.quantity), type: "SALE_RETURN", movementDate: date, unitCost: line.unitCost,
        referenceType: "SALES_RETURN", referenceId: input.returnId, referenceNumber: input.returnNumber,
        idempotencyKey: `sales-return:${input.returnId}:${line.lineId}`, notes: `Retur penjualan ${input.returnNumber}`
      }, actor);
    }
    return { status: "returned" as const, lines: lines.length };
  });
}

/** Riwayat barang masuk (GRN pembelian & input manual), dikelompokkan per dokumen. */
export async function listStockInHistory(limit = 30) {
  const rows = await prisma.inventoryMovement.findMany({
    where: { type: "PURCHASE_RECEIPT" },
    include: { product: { select: { sku: true, name: true, unit: true, unitsPerKoli: true } }, location: { select: { code: true, name: true } } },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
    take: limit * 40
  });
  const groups = new Map<string, { key: string; referenceType: string; referenceNumber: string; movementDate: string; locationCode: string; locationName: string; createdByName: string | null; notes: string | null; items: { sku: string; name: string; quantity: number; unit: string; koliText: string; unitCost: number }[]; totalValue: number }>();
  for (const m of rows) {
    const key = `${m.referenceType}:${m.referenceNumber}:${m.locationId}`;
    let g = groups.get(key);
    if (!g) {
      if (groups.size >= limit) continue;
      g = { key, referenceType: m.referenceType, referenceNumber: m.referenceNumber ?? "-", movementDate: m.movementDate.toISOString(), locationCode: m.location.code, locationName: m.location.name, createdByName: m.createdByName, notes: m.notes, items: [], totalValue: 0 };
      groups.set(key, g);
    }
    const qty = num(m.quantity);
    g.items.push({ sku: m.product.sku, name: m.product.name, quantity: qty, unit: m.product.unit, koliText: koliInfo(qty, m.product.unitsPerKoli, m.product.unit).koliText, unitCost: num(m.unitCost) });
    g.totalValue = round2(g.totalValue + qty * num(m.unitCost));
  }
  return Array.from(groups.values());
}

/** Daftar satuan yang dipakai beserta jumlah barangnya (untuk ubah satuan massal). */
export async function listUnitUsage() {
  const rows = await prisma.inventoryProduct.groupBy({ by: ["unit"], _count: { _all: true }, orderBy: { unit: "asc" } });
  return rows.map((r) => ({ unit: r.unit, count: r._count._all }));
}

/** Ganti satuan semua barang bersatuan `fromUnit` (opsional per kategori) menjadi `toUnit`. Qty stok tidak dikonversi. */
export async function bulkChangeUnit(input: { fromUnit: string; toUnit: string; category?: string }) {
  const toUnit = input.toUnit.trim();
  if (!toUnit) throw new InventoryError("VALIDATION", "Satuan baru wajib diisi.");
  if (toUnit === input.fromUnit) throw new InventoryError("VALIDATION", "Satuan baru sama dengan satuan lama.");
  const result = await prisma.inventoryProduct.updateMany({
    where: { unit: input.fromUnit, ...(input.category ? { category: input.category } : {}) },
    data: { unit: toUnit }
  });
  return { updated: result.count, fromUnit: input.fromUnit, toUnit, category: input.category ?? null };
}

/** Ringkasan stok & modal per SKU (gudang vs toko), dipakai laporan produk. */
export async function stockSnapshotBySkus(skus: string[]) {
  const unique = Array.from(new Set(skus.filter(Boolean)));
  if (!unique.length) return new Map<string, { name: string; hasName: boolean; unit: string; unitsPerKoli: number | null; costPrice: number; warehouse: number; store: number; warehouseKoliText: string; storeKoliText: string }>();
  const products = await prisma.inventoryProduct.findMany({
    where: { OR: [{ sku: { in: unique } }, { sku: { in: unique, mode: "insensitive" } }] },
    include: { balances: { include: { location: { select: { type: true, isActive: true } } } } }
  });
  const map = new Map<string, { name: string; hasName: boolean; unit: string; unitsPerKoli: number | null; costPrice: number; warehouse: number; store: number; warehouseKoliText: string; storeKoliText: string }>();
  for (const p of products) {
    const active = p.balances.filter((b) => b.location.isActive);
    const warehouse = round2(active.filter((b) => b.location.type === "WAREHOUSE").reduce((s, b) => s + num(b.quantity), 0));
    const store = round2(active.filter((b) => b.location.type === "STORE").reduce((s, b) => s + num(b.quantity), 0));
    map.set(p.sku.toLowerCase(), {
      name: p.name, hasName: hasRealName(p.name, p.sku), unit: p.unit,
      unitsPerKoli: p.unitsPerKoli == null ? null : num(p.unitsPerKoli), costPrice: num(p.costPrice),
      warehouse, store,
      warehouseKoliText: koliInfo(warehouse, p.unitsPerKoli, p.unit).koliText,
      storeKoliText: koliInfo(store, p.unitsPerKoli, p.unit).koliText
    });
  }
  return map;
}
