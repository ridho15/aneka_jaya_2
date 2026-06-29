export type StockItem = {
  id: string;
  productCode: string;
  productName: string;
  warehouse: string | null;
  quantity: number | null;
  unit: string | null;
  minimumStock?: number | null;
  rack?: string;
  updatedAt?: string;
  dataQualityWarnings?: string[];
};
