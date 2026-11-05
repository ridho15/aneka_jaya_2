import "server-only";
import type { StockItem } from "@/lib/types/stock";
import { listBalances } from "./service";

/**
 * Ubah saldo inventory SLM ke bentuk StockItem yang dipakai halaman & alur lama
 * (Stok Barang, form penjualan, alert minimum stok). ID produk/gudang memakai ID
 * ERP bila sudah dipetakan supaya data penjualan lama tetap kompatibel.
 */
export async function listLocalStockItems(filter: { productId?: string; sku?: string; warehouse?: string; keyword?: string } = {}): Promise<StockItem[]> {
  const erpId = filter.productId && /^\d+$/.test(filter.productId) ? Number(filter.productId) : undefined;
  const { data } = await listBalances({
    keyword: filter.keyword,
    sku: filter.sku,
    includeZero: true,
    pageSize: 500,
    page: 1
  });
  return data
    .filter((row) => !filter.productId || row.productId === filter.productId || (erpId != null && row.erpProductId === erpId))
    .filter((row) => !filter.warehouse || `${row.locationCode} ${row.locationName}`.toLowerCase().includes(filter.warehouse.toLowerCase()))
    .map((row) => ({
      id: row.id,
      productId: row.erpProductId != null ? String(row.erpProductId) : row.productId,
      productCode: row.sku,
      productName: row.productName,
      warehouse: row.locationName,
      warehouseId: row.erpWarehouseId != null ? String(row.erpWarehouseId) : row.locationId,
      warehouseCode: row.locationCode,
      quantity: row.quantity,
      freeQuantity: row.quantity,
      onHandQuantity: row.quantity,
      reservedQuantity: 0,
      unit: row.unit,
      minimumStock: row.minimumStock,
      isLowStock: row.isLowStock,
      ready: row.quantity > 0,
      updatedAt: row.updatedAt
    }));
}
