import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { StockItem } from "@/lib/types/stock";
import { toStockItem } from "@/lib/api/erpMappers";
import { listErpPage, listErpPaginated } from "@/lib/api/pagination";
import { summarizeStockDetail, type StockDetailSummary } from "@/lib/stocks/detail";

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

export type StockDetail = {
  productKey: string;
  productId?: string;
  sku: string;
  productName: string;
  stocks: StockItem[];
  summary: StockDetailSummary;
  lookup: "productId" | "sku";
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

function stockQuery(options: StockListOptions = {}) {
  return {
    product_id: options.productId,
    product_sku: options.sku,
    warehouse: options.warehouse,
    keyword: options.keyword
  };
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
  const response = await listErpPaginated("/stocks", { query: stockQuery(options), perPage: options.pageSize, maxPages: options.maxPages });
  if (!response.success) return response.code === "ERP_SCHEMA" ? failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA") : response;
  const rows = response.data;
  if (!Array.isArray(rows)) return failure("Format data stok dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: filterStocks(rows.map((row) => toStockItem(row as Record<string, unknown>)), options) };
}

export async function listStocksPage(options: StockListOptions = {}): Promise<ApiResponse<StockTablePage>> {
  const page = clampPage(options.page);
  const pageSize = clampPageSize(options.pageSize);
  const response = await listErpPage("/stocks", { query: stockQuery(options), page, perPage: pageSize });
  if (!response.success) return response;
  const rows = filterStocks(response.data.data.map((row) => toStockItem(row as Record<string, unknown>)), options);
  return {
    success: true,
    data: {
      data: rows,
      meta: {
        page: response.data.meta.page,
        pageSize: response.data.meta.pageSize,
        total: response.data.meta.total,
        totalPages: response.data.meta.totalPages
      }
    }
  };
}

export async function getStockDetail(productKey: string, fallbackSku?: string): Promise<ApiResponse<StockDetail>> {
  const normalizedKey = String(productKey || "").trim();
  const normalizedSku = String(fallbackSku || "").trim();
  if (!normalizedKey || normalizedKey.length > 160 || normalizedSku.length > 160) {
    return failure("Referensi produk tidak valid.", "VALIDATION");
  }

  const byProductId = await listStocks({ productId: normalizedKey, pageSize: 100, maxPages: 10 });
  if (!byProductId.success) return byProductId;

  let rows = byProductId.data;
  let lookup: StockDetail["lookup"] = "productId";
  if (rows.length === 0 && normalizedSku) {
    const bySku = await listStocks({ sku: normalizedSku, pageSize: 100, maxPages: 10 });
    if (!bySku.success) return bySku;
    rows = bySku.data;
    lookup = "sku";
  }

  const first = rows[0];
  return {
    success: true,
    data: {
      productKey: normalizedKey,
      productId: first?.productId || (lookup === "productId" ? normalizedKey : undefined),
      sku: first?.productCode || normalizedSku || normalizedKey,
      productName: first?.productName || normalizedSku || normalizedKey,
      stocks: rows,
      summary: summarizeStockDetail(rows),
      lookup
    }
  };
}
