import "server-only";
import { anikaRequest } from "./anikaClient";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { StockItem } from "@/lib/types/stock";

export async function listStocks(): Promise<ApiResponse<StockItem[]>> {
  const response = await anikaRequest<unknown>("/stocks");
  if (!response.success) return response;
  const rows = Array.isArray(response.data) ? response.data : (response.data as { data?: unknown[] }).data;
  if (!Array.isArray(rows)) return failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: rows.map((row) => { const stock = row as Record<string, unknown>; const product = stock.product as Record<string, unknown> | undefined; const warehouse = stock.warehouse as Record<string, unknown> | undefined; return { id: String(stock.id ?? stock.stock_id ?? crypto.randomUUID()), productCode: String(product?.sku ?? stock.sku ?? stock.product_code ?? "-"), productName: String(product?.name ?? stock.product_name ?? stock.name ?? "Produk"), warehouse: String(warehouse?.name ?? stock.warehouse_name ?? "Toko"), quantity: Number(stock.quantity ?? stock.qty ?? stock.stock ?? 0), minimumStock: Number(stock.minimum_stock ?? product?.minimum_stock ?? 0), rack: stock.rack ? String(stock.rack) : undefined, unit: String(product?.uom ?? stock.unit ?? "PCS"), updatedAt: stock.updated_at ? String(stock.updated_at) : undefined }; }) };
}
