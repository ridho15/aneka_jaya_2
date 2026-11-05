import { inventoryRoute, searchParams } from "@/lib/inventory/http";
import { stockMatrix } from "@/lib/inventory/service";

/** Matriks stok: tiap produk dengan kolom per gudang & toko + total. */
export const GET = inventoryRoute("inventory.stock.view", async (request) => {
  const q = searchParams(request);
  const type = q.get("locationType")?.toUpperCase();
  const result = await stockMatrix({ keyword: q.get("keyword"), locationType: type === "STORE" || type === "WAREHOUSE" ? type : undefined, page: q.int("page"), pageSize: q.int("pageSize") });
  return { data: result.data, meta: { ...result.meta, locations: result.locations } };
});
