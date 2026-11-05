import "server-only";
import { listErpPaginated } from "@/lib/api/pagination";
import { toStockItem } from "@/lib/api/erpMappers";
import type { StockItem } from "@/lib/types/stock";
import { InventoryError } from "./errors";
import { round2 } from "./math";
import { DEFAULT_UNIT } from "./config";
import { lockBalanceQuantity, postMovement, runInventoryTransaction, type InventoryActor } from "./service";

export type ErpImportSummary = {
  dryRun: boolean;
  erpRows: number;
  locationsCreated: number;
  productsCreated: number;
  balancesSet: number;
  skipped: { reason: string; row: string }[];
};

type Aggregated = { productKey: string; erpProductId?: number; sku: string; name: string; unit: string; minimumStock: number; warehouseKey: string; erpWarehouseId?: number; warehouseName: string; warehouseCode?: string; quantity: number };

function intId(value?: string) {
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

export function aggregateErpStocks(rows: StockItem[]) {
  const skipped: ErpImportSummary["skipped"] = [];
  const map = new Map<string, Aggregated>();
  for (const row of rows) {
    if (!row.productCode) { skipped.push({ reason: "SKU kosong", row: row.id }); continue; }
    const warehouseKey = row.warehouseId || row.warehouseCode || row.warehouse || "";
    if (!warehouseKey) { skipped.push({ reason: "Gudang kosong", row: row.productCode }); continue; }
    const key = `${row.productCode}::${warehouseKey}`;
    const existing = map.get(key);
    const qty = row.quantity ?? 0;
    if (existing) { existing.quantity = round2(existing.quantity + qty); continue; }
    map.set(key, {
      productKey: row.productCode,
      erpProductId: intId(row.productId),
      sku: row.productCode,
      name: row.productName,
      unit: row.unit || DEFAULT_UNIT,
      minimumStock: row.minimumStock ?? 0,
      warehouseKey,
      erpWarehouseId: intId(row.warehouseId),
      warehouseName: row.warehouse || `Gudang ${warehouseKey}`,
      warehouseCode: row.warehouseCode,
      quantity: qty
    });
  }
  return { rows: Array.from(map.values()), skipped };
}

/**
 * Impor master barang, gudang, dan saldo stok dari Anika ERP ke inventory SLM.
 * Saldo lokal di-SET sama dengan qty ERP (selisih dicatat sebagai mutasi INITIAL),
 * sehingga aman dijalankan ulang menjelang cutover.
 */
export async function importInventoryFromErp(options: { dryRun?: boolean; maxPages?: number }, actor?: InventoryActor): Promise<ErpImportSummary> {
  const response = await listErpPaginated("/stocks", { perPage: 100, maxPages: options.maxPages ?? 200 });
  if (!response.success) throw new InventoryError("INVALID_STATE", `Gagal membaca stok ERP: ${response.message}`, 502);
  const items = (response.data as Record<string, unknown>[]).map((row) => toStockItem(row));
  const { rows, skipped } = aggregateErpStocks(items);
  const summary: ErpImportSummary = { dryRun: Boolean(options.dryRun), erpRows: items.length, locationsCreated: 0, productsCreated: 0, balancesSet: 0, skipped };
  if (options.dryRun) {
    summary.balancesSet = rows.length;
    return summary;
  }
  const stamp = new Date().toISOString();
  for (const row of rows) {
    await runInventoryTransaction(async (tx) => {
      let location = row.erpWarehouseId
        ? await tx.inventoryLocation.findUnique({ where: { erpWarehouseId: row.erpWarehouseId } })
        : await tx.inventoryLocation.findFirst({ where: { name: row.warehouseName } });
      if (!location) {
        const code = (row.warehouseCode || `ERP-${row.erpWarehouseId ?? row.warehouseKey}`).toUpperCase().replace(/\s+/g, "-").slice(0, 40);
        location = await tx.inventoryLocation.create({ data: { code, name: row.warehouseName, type: /toko|store/i.test(row.warehouseName) ? "STORE" : "WAREHOUSE", erpWarehouseId: row.erpWarehouseId ?? null } });
        summary.locationsCreated++;
      }
      let product = (row.erpProductId ? await tx.inventoryProduct.findUnique({ where: { erpProductId: row.erpProductId } }) : null)
        ?? await tx.inventoryProduct.findUnique({ where: { sku: row.sku } });
      if (!product) {
        product = await tx.inventoryProduct.create({ data: { sku: row.sku, name: row.name, unit: row.unit, minimumStock: row.minimumStock, erpProductId: row.erpProductId ?? null } });
        summary.productsCreated++;
      } else if (row.erpProductId && !product.erpProductId) {
        product = await tx.inventoryProduct.update({ where: { id: product.id }, data: { erpProductId: row.erpProductId } });
      }
      const current = await lockBalanceQuantity(tx, product.id, location.id);
      const delta = round2(row.quantity - current);
      if (delta !== 0) {
        await postMovement(tx, {
          productId: product.id, locationId: location.id, delta, type: "INITIAL", movementDate: new Date(),
          referenceType: "ERP_IMPORT", referenceNumber: `ERP-IMPORT-${stamp.slice(0, 10)}`, allowNegative: true,
          idempotencyKey: `erp-import:${stamp}:${product.id}:${location.id}`, notes: `Sinkron saldo dari ERP (${current} → ${row.quantity})`
        }, actor);
      }
      summary.balancesSet++;
    });
  }
  return summary;
}
