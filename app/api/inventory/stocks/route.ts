import { inventoryRoute, searchParams } from "@/lib/inventory/http";
import { listBalances } from "@/lib/inventory/service";

/** Saldo stok per produk per lokasi (gudang/toko). */
export const GET = inventoryRoute("inventory.stock.view", async (request) => {
  const q = searchParams(request);
  const type = q.get("locationType")?.toUpperCase();
  return listBalances({
    locationId: q.get("locationId"),
    locationType: type === "STORE" || type === "WAREHOUSE" ? type : undefined,
    productId: q.get("productId"),
    sku: q.get("sku"),
    keyword: q.get("keyword"),
    lowStockOnly: q.bool("lowStockOnly"),
    includeZero: q.bool("includeZero"),
    page: q.int("page"),
    pageSize: q.int("pageSize")
  });
});
