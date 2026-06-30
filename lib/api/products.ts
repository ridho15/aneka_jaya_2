import "server-only";
import { anikaRequest } from "./anikaClient";
import { sendNeoCommand } from "./neo";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { Product, ProductListItem } from "@/lib/types/product";
import type { BarangInput } from "@/lib/validation/barangSchema";
import { recordAudit } from "@/lib/audit/store";
import { toProduct, toProductListItem } from "@/lib/api/erpMappers";
import { listErpPaginated } from "@/lib/api/pagination";

export type ProductPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProductTablePage = {
  data: ProductListItem[];
  meta: ProductPageMeta;
};

export type ProductListOptions = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type OfficialProductInput = {
  sku: string;
  name: string;
  productCategoryId: number;
  uomId: number;
  brandCode: string;
  sellPrice?: number;
  costPrice?: number;
  description?: string;
};

const DEFAULT_PRODUCT_PAGE = 1;
const DEFAULT_PRODUCT_PAGE_SIZE = 50;
const MAX_PRODUCT_PAGE_SIZE = 100;

function clampPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : DEFAULT_PRODUCT_PAGE;
}

function clampPageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_PRODUCT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_PRODUCT_PAGE_SIZE);
}

function normalizeKeyword(value?: string) {
  return String(value ?? "").trim().toLowerCase();
}

function filterProductItems(items: ProductListItem[], keyword?: string) {
  const value = normalizeKeyword(keyword);
  if (!value) return items;
  return items.filter((item) => `${item.code} ${item.name} ${item.category ?? ""}`.toLowerCase().includes(value));
}

export function paginateProductItems(items: ProductListItem[], options: ProductListOptions = {}): ProductTablePage {
  const page = clampPage(options.page);
  const pageSize = clampPageSize(options.pageSize);
  const filtered = filterProductItems(items, options.keyword);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    data: filtered.slice(start, start + pageSize),
    meta: { page: safePage, pageSize, total, totalPages }
  };
}

export async function listProducts(): Promise<ApiResponse<Product[]>> {
  const response = await listErpPaginated("/products", { query: { include_stock: true } });
  if (!response.success) return response.code === "ERP_SCHEMA" ? failure("Format data produk dari ERP tidak dikenali.", "ERP_SCHEMA") : response;
  const rows = response.data;
  if (!Array.isArray(rows)) return failure("Format data produk dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: rows.map((row) => toProduct(row as Record<string, unknown>)) };
}

export async function listProductTableItems(): Promise<ApiResponse<ProductListItem[]>> {
  const products = await listProducts();
  if (!products.success) return products;
  return { success: true, data: products.data.map(toProductListItem) };
}

export async function listProductTablePage(options: ProductListOptions = {}): Promise<ApiResponse<ProductTablePage>> {
  const products = await listProductTableItems();
  if (!products.success) return products;
  return { success: true, data: paginateProductItems(products.data, options) };
}

export async function getProduct(id: string): Promise<ApiResponse<Product>> {
  const products = await listProducts();
  if (!products.success) return products;
  const product = products.data.find((item) => item.id === id);
  return product ? { success: true, data: product } : failure("Barang tidak ditemukan.", "NOT_FOUND");
}

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function normalizeLookup(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function responseId(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : undefined;
  const nested = row?.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  return numberId(row?.id) ?? numberId(row?.product_id) ?? numberId(nested?.id) ?? numberId(nested?.product_id);
}

export async function findProductIdBySku(sku: string): Promise<ApiResponse<number | undefined>> {
  const cleanSku = sku.trim();
  if (!cleanSku) return { success: true, data: undefined };
  const response = await listErpPaginated("/products", { maxPages: 2, query: { sku: cleanSku } });
  if (!response.success) return response;
  const normalized = normalizeLookup(cleanSku);
  const match = response.data
    .map((row) => toProduct(row as Record<string, unknown>))
    .find((product) => normalizeLookup(product.code) === normalized || normalizeLookup(product.id) === normalized || normalizeLookup(product.productId) === normalized);
  return { success: true, data: numberId(match?.productId) ?? numberId(match?.id) };
}

export async function createOfficialProduct(input: OfficialProductInput): Promise<ApiResponse<number>> {
  const response = await anikaRequest<unknown>("/products", {
    method: "POST",
    body: JSON.stringify({
      sku: input.sku,
      name: input.name,
      product_category_id: input.productCategoryId,
      kode_merk: input.brandCode,
      uom_id: input.uomId,
      cost_price: input.costPrice ?? 0,
      sell_price: input.sellPrice ?? 0,
      description: input.description || undefined,
      is_active: true
    })
  });
  if (!response.success) return response;
  const id = responseId(response.data);
  if (!id) return failure("Produk ERP berhasil dibuat tetapi ID produk tidak terbaca.", "ERP_SCHEMA");
  await recordAudit({
    entityType: "product",
    entityId: input.sku,
    action: "create",
    afterValue: { sku: input.sku, name: input.name, source: "sales_manual_product" },
    reason: "Produk ERP dibuat otomatis dari transaksi SLM"
  });
  return { success: true, data: id };
}

export async function createProduct(input: BarangInput): Promise<ApiResponse<unknown>> {
  const response = await sendNeoCommand({
    text: `Tambahkan barang ${input.name} dengan kode ${input.code}.`,
    parsedIntent: {
      action: "import_products",
      products: [{ sku: input.code, name: input.name, category: input.category, uom: input.unit, sell_price: input.sellingPrice, cost_price: input.costPrice, brand: input.brand || undefined, initial_stock: input.initialStock, minimum_stock: input.minimumStock, warehouse: input.warehouse || undefined, rak: input.rack || undefined, description: input.notes || undefined, is_active: input.isActive }]
    }
  });
  if (response.success) await recordAudit({ entityType: "product", entityId: input.code, action: "create", afterValue: input, reason: "Master Barang & Stok • Terkirim" });
  return response;
}

export async function updateProduct(id: string, input: BarangInput): Promise<ApiResponse<unknown>> {
  const current = await getProduct(id);
  if (!current.success) return current;
  if (!current.data.productCategoryId || !current.data.uomId || !(input.brand || current.data.brandCode)) {
    return failure("Data ERP untuk kategori, satuan, atau merk belum lengkap. Barang tidak diperbarui.", "ERP_REFERENCE_MISSING");
  }
  // Body below follows ProductRequest in the supplied OpenAPI YAML. Category/unit IDs are preserved from ERP because
  // the staff form intentionally accepts readable names rather than exposing technical identifiers.
  const response = await anikaRequest(`/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ sku: input.code, name: input.name, product_category_id: current.data.productCategoryId, kode_merk: input.brand || current.data.brandCode, uom_id: current.data.uomId, cost_price: input.costPrice, sell_price: input.sellingPrice, description: input.notes || undefined, is_active: input.isActive })
  });
  if (response.success) await recordAudit({ entityType: "product", entityId: id, action: "update", beforeValue: current.data, afterValue: input, reason: "Master Barang • Terkirim" });
  return response;
}

export async function deactivateProduct(id: string): Promise<ApiResponse<unknown>> {
  const current = await getProduct(id);
  if (!current.success) return current;
  const input: BarangInput = {
    code: current.data.code,
    name: current.data.name,
    category: current.data.category || "Lain - Lain",
    unit: current.data.unit || "PCS",
    sellingPrice: current.data.sellingPrice ?? 0,
    costPrice: current.data.costPrice ?? 0,
    brand: current.data.brand || current.data.brandCode || "UMUM",
    initialStock: current.data.initialStock ?? 0,
    minimumStock: current.data.minimumStock ?? 0,
    warehouse: current.data.warehouse || "Toko",
    rack: current.data.rack || "",
    isActive: false,
    notes: current.data.notes || ""
  };
  const response = await updateProduct(id, input);
  if (response.success) {
    await recordAudit({ entityType: "product", entityId: id, action: "update", beforeValue: current.data, afterValue: { ...current.data, isActive: false }, reason: "Master Barang • Nonaktifkan barang di ERP" });
  }
  return response;
}
