import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { StockItem } from "@/lib/types/stock";
import { toStockItem } from "@/lib/api/erpMappers";
import { listErpPaginated } from "@/lib/api/pagination";

export type StockListOptions = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  productId?: string;
  sku?: string;
  warehouse?: string;
  productIds?: string[];
  skus?: string[];
  maxPages?: number;
};

export type StockPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type StockTablePage = {
  data: StockItem[];
  meta: StockPageMeta;
};

const DEFAULT_STOCK_PAGE = 1;
const DEFAULT_STOCK_PAGE_SIZE = 50;
const MAX_STOCK_PAGE_SIZE = 100;

function clampPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : DEFAULT_STOCK_PAGE;
}

function clampPageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_STOCK_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_STOCK_PAGE_SIZE);
}

function normalize(value?: string) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesAny(value: string | undefined, candidates?: string[]) {
  if (!candidates?.length) return true;
  const normalized = normalize(value);
  return candidates.map(normalize).filter(Boolean).includes(normalized);
}

function filterStocks(items: StockItem[], options: StockListOptions = {}) {
  const keyword = normalize(options.keyword);
  const productId = normalize(options.productId);
  const sku = normalize(options.sku);
  const warehouse = normalize(options.warehouse);
  return items.filter((item) => {
    if (productId && normalize(item.productId) !== productId) return false;
    if (sku && normalize(item.productCode) !== sku) return false;
    if (warehouse && !normalize(item.warehouse ?? "").includes(warehouse)) return false;
    if (!matchesAny(item.productId, options.productIds)) return false;
    if (!matchesAny(item.productCode, options.skus)) return false;
    if (keyword && !`${item.productCode} ${item.productName} ${item.warehouse ?? ""} ${item.rack ?? ""}`.toLowerCase().includes(keyword)) return false;
    return true;
  });
}

export function paginateStocks(items: StockItem[], options: StockListOptions = {}): StockTablePage {
  const page = clampPage(options.page);
  const pageSize = clampPageSize(options.pageSize);
  const filtered = filterStocks(items, options);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    data: filtered.slice(start, start + pageSize),
    meta: { page: safePage, pageSize, total, totalPages }
  };
}

export async function listStocks(options: StockListOptions = {}): Promise<ApiResponse<StockItem[]>> {
  const query: Record<string, string | number | boolean | undefined> = {
    product_id: options.productId,
    product_sku: options.sku,
    warehouse: options.warehouse,
    keyword: options.keyword
  };
  const response = await listErpPaginated("/stocks", { query, perPage: options.pageSize, maxPages: options.maxPages });
  if (!response.success) return response.code === "ERP_SCHEMA" ? failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA") : response;
  const rows = response.data;
  if (!Array.isArray(rows)) return failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: filterStocks(rows.map((row) => toStockItem(row as Record<string, unknown>)), options) };
}

export async function listStocksPage(options: StockListOptions = {}): Promise<ApiResponse<StockTablePage>> {
  const response = await listStocks({ ...options, maxPages: options.maxPages ?? 1, pageSize: options.pageSize ?? DEFAULT_STOCK_PAGE_SIZE });
  if (!response.success) return response;
  return { success: true, data: paginateStocks(response.data, options) };
}
