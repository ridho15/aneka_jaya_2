import type { StockItem } from "@/lib/types/stock";

export type ProductStockSummary = {
  quantity: number | null;
  reservedQuantity: number | null;
  freeQuantity: number | null;
  onHandQuantity: number | null;
  minimumStock: number | null;
  warehouseCount: number | null;
  rackCount: number | null;
  isLowStock: boolean | null;
};

export type Product = {
  id: string;
  productId?: string;
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  sellingPrice: number | null;
  costPrice: number | null;
  brand?: string;
  initialStock?: number | null;
  minimumStock?: number | null;
  warehouse?: string | null;
  rack?: string;
  isActive: boolean | null;
  notes?: string;
  updatedAt: string;
  /** ERP identifiers retained server-side for the documented PUT /products/{product} request. */
  productCategoryId?: number;
  uomId?: number;
  brandCode?: string;
  stockSummary?: ProductStockSummary;
  stockBreakdown?: StockItem[];
  dataQualityWarnings?: string[];
};

export type ProductListItem = Pick<Product, "id" | "productId" | "code" | "name" | "category" | "sellingPrice" | "minimumStock" | "isActive" | "updatedAt" | "stockSummary" | "stockBreakdown" | "dataQualityWarnings">;
