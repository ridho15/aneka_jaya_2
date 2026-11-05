import { inventoryRoute, parseBody, searchParams, auditInventory } from "@/lib/inventory/http";
import { createProduct, listProducts } from "@/lib/inventory/service";
import { productSchema } from "@/lib/inventory/validation";

export const GET = inventoryRoute("inventory.stock.view", async (request) => {
  const q = searchParams(request);
  return listProducts({ keyword: q.get("keyword"), page: q.int("page"), pageSize: q.int("pageSize"), includeInactive: q.bool("includeInactive") });
});

export const POST = inventoryRoute("inventory.master", async (request, ctx) => {
  const product = await createProduct(await parseBody(request, productSchema), ctx.actor);
  await auditInventory(ctx, product.id, `Tambah barang inventory ${product.sku}`, product);
  return product;
}, { status: 201 });
