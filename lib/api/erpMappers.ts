import type { Product, ProductListItem } from "@/lib/types/product";
import type { StockItem } from "@/lib/types/stock";

type UnknownRow = Record<string, unknown>;

const NAME_KEYS = ["name", "nama", "label", "title", "code", "kode", "sku"] as const;

function isRecord(value: unknown): value is UnknownRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstPresent(row: UnknownRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

function textFrom(value: unknown, keys: readonly string[] = NAME_KEYS): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value)) {
    for (const key of keys) {
      const text = textFrom(value[key], []);
      if (text) return text;
    }
  }
  return null;
}

function numberFrom(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function booleanFrom(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "active" || normalized === "aktif" || normalized === "enabled") return true;
    if (normalized === "false" || normalized === "0" || normalized === "inactive" || normalized === "nonaktif" || normalized === "disabled") return false;
  }
  return null;
}

function warnInvalid(source: "product" | "stock", rowKey: string, warnings: string[]) {
  if (warnings.length === 0) return;
  console.warn(`[ERP ${source}] Data tidak lengkap/invalid pada ${rowKey}: ${warnings.join(", ")}`);
}

function rowKey(row: UnknownRow) {
  return textFrom(firstPresent(row, ["sku", "code", "product_code", "id", "product_id", "stock_id"])) ?? "baris-tanpa-kode";
}

function idNumberFrom(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);
    if (parsed !== null) return parsed;
  }
  return undefined;
}

function productCategoryName(raw: UnknownRow) {
  return textFrom(raw.product_category) ?? textFrom(raw.category) ?? textFrom(raw.productCategory);
}

function productUnitName(raw: UnknownRow) {
  return textFrom(raw.uom) ?? textFrom(raw.unit) ?? textFrom(raw.satuan);
}

function productBrandName(raw: UnknownRow) {
  return textFrom(raw.brand) ?? textFrom(raw.merk) ?? textFrom(raw.kode_merk);
}

function warehouseName(raw: UnknownRow) {
  return textFrom(raw.warehouse) ?? textFrom(raw.gudang) ?? textFrom(raw.warehouse_name);
}

export function normalizeProductCode(value: unknown) {
  return textFrom(value)?.trim().toLowerCase() ?? "";
}

export function toProduct(raw: UnknownRow): Product {
  const warnings: string[] = [];
  const code = textFrom(firstPresent(raw, ["sku", "code", "product_code"])) ?? "";
  const name = textFrom(raw.name) ?? "";
  const category = productCategoryName(raw);
  const unit = productUnitName(raw);
  const sellingPrice = numberFrom(firstPresent(raw, ["sell_price", "sellPrice", "selling_price", "sellingPrice", "sale_price", "retail_price", "price", "harga", "harga_jual", "hargaJual"]));
  const costPrice = numberFrom(firstPresent(raw, ["cost_price", "cost", "harga_modal"]));
  const initialStock = numberFrom(raw.initial_stock);
  const minimumStock = numberFrom(firstPresent(raw, ["minimum_stock", "minimumStock", "minimum", "minimum_qty", "min_qty", "min_stock", "stock_minimum", "minimum_stok", "min_stok"]));
  const isActive = booleanFrom(firstPresent(raw, ["is_active", "isActive", "active", "enabled", "status"]));

  if (!category) warnings.push("kategori");
  if (!unit) warnings.push("satuan");
  if (sellingPrice === null) warnings.push("harga jual");
  if (costPrice === null) warnings.push("harga modal");
  if (minimumStock === null) warnings.push("minimum stock");
  if (isActive === null) warnings.push("status aktif");

  warnInvalid("product", code || rowKey(raw), warnings);

  const categoryObject = isRecord(raw.product_category) ? raw.product_category : isRecord(raw.category) ? raw.category : undefined;
  const uomObject = isRecord(raw.uom) ? raw.uom : isRecord(raw.unit) ? raw.unit : undefined;
  const brandObject = isRecord(raw.brand) ? raw.brand : undefined;

  return {
    id: textFrom(firstPresent(raw, ["id", "product_id"])) ?? code,
    code,
    name,
    category,
    unit,
    sellingPrice,
    costPrice,
    brand: productBrandName(raw) ?? undefined,
    initialStock,
    minimumStock,
    warehouse: warehouseName(raw),
    rack: textFrom(raw.rack ?? raw.rak) ?? undefined,
    isActive,
    notes: textFrom(raw.notes ?? raw.description) ?? undefined,
    updatedAt: textFrom(raw.updated_at) ?? new Date().toISOString(),
    productCategoryId: idNumberFrom(raw.product_category_id, categoryObject?.id),
    uomId: idNumberFrom(raw.uom_id, uomObject?.id),
    brandCode: textFrom(raw.kode_merk) ?? textFrom(brandObject?.code) ?? undefined,
    dataQualityWarnings: warnings
  };
}

export function toProductListItem(product: Product): ProductListItem {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    category: product.category,
    sellingPrice: product.sellingPrice,
    minimumStock: product.minimumStock,
    isActive: product.isActive,
    updatedAt: product.updatedAt,
    dataQualityWarnings: product.dataQualityWarnings
  };
}

export function toStockItem(raw: UnknownRow): StockItem {
  const stock = raw;
  const product = isRecord(stock.product) ? stock.product : undefined;
  const warehouse = isRecord(stock.warehouse) ? stock.warehouse : undefined;
  const warnings: string[] = [];
  const productCode = textFrom(product?.sku) ?? textFrom(product?.code) ?? textFrom(firstPresent(stock, ["sku", "product_code", "productCode", "item_code", "itemCode", "barang_code", "barangCode", "code", "product_id", "productId"])) ?? "";
  const productName = textFrom(product?.name) ?? textFrom(firstPresent(stock, ["product_name", "name"])) ?? "Produk";
  const quantity = numberFrom(firstPresent(stock, ["quantity", "qty", "stock", "stock_qty", "stockQty", "available_qty", "availableQty", "on_hand", "onHand", "balance"]));
  const minimumStock = numberFrom(firstPresent(stock, ["minimum_stock", "minimumStock", "minimum", "minimum_qty", "min_qty", "min_stock", "stock_minimum", "minimum_stok", "min_stok"])) ?? numberFrom(product?.minimum_stock);
  const unit = textFrom(product?.uom) ?? textFrom(stock.unit) ?? textFrom(stock.uom);
  const resolvedWarehouse = textFrom(warehouse) ?? warehouseName(stock);

  if (quantity === null) warnings.push("quantity");
  if (minimumStock === null) warnings.push("minimum stock");
  if (!unit) warnings.push("satuan");
  if (!resolvedWarehouse) warnings.push("gudang");

  warnInvalid("stock", productCode || rowKey(stock), warnings);

  return {
    id: textFrom(firstPresent(stock, ["id", "stock_id"])) ?? `${productCode || "stock"}-${textFrom(warehouse?.id) ?? resolvedWarehouse ?? "unknown"}`,
    productCode,
    productName,
    warehouse: resolvedWarehouse,
    quantity,
    unit,
    minimumStock,
    rack: textFrom(stock.rack ?? stock.rak) ?? undefined,
    updatedAt: textFrom(stock.updated_at) ?? undefined,
    dataQualityWarnings: warnings
  };
}
