import "server-only";
import { anikaRequest } from "./anikaClient";
import { sendNeoCommand } from "./neo";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { Product } from "@/lib/types/product";
import type { BarangInput } from "@/lib/validation/barangSchema";
import { recordAudit } from "@/lib/audit/store";

function toProduct(raw: Record<string, unknown>): Product {
  const categoryObject = raw.product_category as Record<string, unknown> | undefined;
  const uomObject = raw.uom as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? raw.product_id ?? ""), code: String(raw.sku ?? raw.code ?? ""), name: String(raw.name ?? ""),
    category: String(categoryObject?.name ?? raw.category ?? "-"), unit: String(uomObject?.name ?? raw.unit ?? "PCS"),
    sellingPrice: Number(raw.sell_price ?? raw.selling_price ?? raw.price ?? 0), costPrice: Number(raw.cost_price ?? raw.cost ?? 0),
    brand: raw.brand ? String(raw.brand) : undefined, initialStock: raw.initial_stock === undefined ? undefined : Number(raw.initial_stock), minimumStock: raw.minimum_stock === undefined ? undefined : Number(raw.minimum_stock),
    warehouse: raw.warehouse ? String(raw.warehouse) : undefined, rack: raw.rack ? String(raw.rack) : undefined,
    isActive: raw.is_active === undefined ? true : Boolean(raw.is_active), notes: raw.notes ? String(raw.notes) : undefined,
    updatedAt: String(raw.updated_at ?? new Date().toISOString()),
    productCategoryId: raw.product_category_id === undefined ? undefined : Number(raw.product_category_id),
    uomId: raw.uom_id === undefined ? undefined : Number(raw.uom_id),
    brandCode: raw.kode_merk ? String(raw.kode_merk) : undefined
  };
}

export async function listProducts(): Promise<ApiResponse<Product[]>> {
  const response = await anikaRequest<unknown>("/products");
  if (!response.success) return response;
  const rows = Array.isArray(response.data) ? response.data : (response.data as { data?: unknown[] }).data;
  if (!Array.isArray(rows)) return failure("Format data produk dari ERP tidak dikenali.", "ERP_SCHEMA");
  return { success: true, data: rows.map((row) => toProduct(row as Record<string, unknown>)) };
}

export async function getProduct(id: string): Promise<ApiResponse<Product>> {
  const products = await listProducts();
  if (!products.success) return products;
  const product = products.data.find((item) => item.id === id);
  return product ? { success: true, data: product } : failure("Barang tidak ditemukan.", "NOT_FOUND");
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
