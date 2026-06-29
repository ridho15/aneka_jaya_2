export type Product = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  costPrice: number;
  brand?: string;
  initialStock?: number;
  minimumStock?: number;
  warehouse?: string;
  rack?: string;
  isActive: boolean;
  notes?: string;
  updatedAt: string;
  /** ERP identifiers retained server-side for the documented PUT /products/{product} request. */
  productCategoryId?: number;
  uomId?: number;
  brandCode?: string;
};
