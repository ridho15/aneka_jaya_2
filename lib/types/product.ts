export type Product = {
  id: string;
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
  dataQualityWarnings?: string[];
};

export type ProductListItem = Pick<Product, "id" | "code" | "name" | "category" | "sellingPrice" | "minimumStock" | "isActive" | "updatedAt" | "dataQualityWarnings">;
