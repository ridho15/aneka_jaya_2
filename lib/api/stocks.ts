import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { StockItem } from "@/lib/types/stock";
import { toStockItem } from "@/lib/api/erpMappers";
import { listErpPaginated } from "@/lib/api/pagination";

export async function listStocks(): Promise<ApiResponse<StockItem[]>> {
  const response = await listErpPaginated("/stocks");
  if (!response.success) return response.code === "ERP_SCHEMA" ? failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA") : response;
  const rows = response.data;
  if (!Array.isArray(rows)) return failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: rows.map((row) => toStockItem(row as Record<string, unknown>)) };
}
