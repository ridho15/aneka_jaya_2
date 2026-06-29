import "server-only";
import { anikaRequest } from "./anikaClient";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { StockItem } from "@/lib/types/stock";
import { toStockItem } from "@/lib/api/erpMappers";

export async function listStocks(): Promise<ApiResponse<StockItem[]>> {
  const response = await anikaRequest<unknown>("/stocks");
  if (!response.success) return response;
  const rows = Array.isArray(response.data) ? response.data : (response.data as { data?: unknown[] }).data;
  if (!Array.isArray(rows)) return failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: rows.map((row) => toStockItem(row as Record<string, unknown>)) };
}
