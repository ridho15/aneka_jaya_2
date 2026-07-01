import type { StockItem } from "@/lib/types/stock";

export type StockDetailSummary = {
  quantity: number | null;
  freeQuantity: number | null;
  onHandQuantity: number | null;
  reservedQuantity: number | null;
  minimumStock: number | null;
  warehouseCount: number;
  rackCount: number;
  ready: boolean | null;
  isLowStock: boolean | null;
};

type StockDetailLinkInput = {
  id: string;
  productId?: string;
  sku?: string;
};

function safeInternalReturnTo(value?: string) {
  if (!value || value.startsWith("//")) return undefined;
  if (value === "/barang" || value.startsWith("/barang?")) return value;
  if (value === "/stok-barang" || value.startsWith("/stok-barang?")) return value;
  return undefined;
}

export function stockDetailHref(input: StockDetailLinkInput, returnTo?: string) {
  const productKey = String(input.productId || input.sku || input.id).trim();
  if (!productKey) return "/stok-barang";
  const params = new URLSearchParams();
  if (input.sku?.trim()) params.set("sku", input.sku.trim());
  const safeReturnTo = safeInternalReturnTo(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return `/stok-barang/${encodeURIComponent(productKey)}${query ? `?${query}` : ""}`;
}

function sumKnown(rows: StockItem[], field: "quantity" | "freeQuantity" | "onHandQuantity" | "reservedQuantity") {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

export function summarizeStockDetail(rows: StockItem[]): StockDetailSummary {
  const quantity = sumKnown(rows, "quantity");
  const minimumValues = rows
    .map((row) => row.minimumStock)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minimumStock = minimumValues.length > 0 ? Math.max(...minimumValues) : null;
  const explicitLowStock = rows.map((row) => row.isLowStock).find((value) => typeof value === "boolean");
  const explicitReady = rows.map((row) => row.ready).find((value) => typeof value === "boolean");
  const warehouses = new Set(rows.map((row) => row.warehouse).filter(Boolean));
  const racks = new Set(rows.map((row) => row.rack).filter(Boolean));

  return {
    quantity,
    freeQuantity: sumKnown(rows, "freeQuantity"),
    onHandQuantity: sumKnown(rows, "onHandQuantity"),
    reservedQuantity: sumKnown(rows, "reservedQuantity"),
    minimumStock,
    warehouseCount: warehouses.size,
    rackCount: racks.size,
    ready: explicitReady ?? (quantity === null ? null : quantity > 0),
    isLowStock: explicitLowStock ?? (
      quantity !== null && minimumStock !== null && minimumStock > 0
        ? quantity <= minimumStock
        : null
    )
  };
}

export function stockDetailReturnTo(value?: string) {
  return safeInternalReturnTo(value) || "/stok-barang";
}
