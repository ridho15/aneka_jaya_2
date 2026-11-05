import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { getProduct, updateProduct } from "@/lib/inventory/service";
import { productUpdateSchema } from "@/lib/inventory/validation";

/** `id` boleh berupa ID lokal atau SKU. */
export const GET = inventoryRoute<{ id: string }>("inventory.view", async (_request, _ctx, { id }) => getProduct(decodeURIComponent(id)));

export const PATCH = inventoryRoute<{ id: string }>("inventory.manage", async (request, ctx, { id }) => {
  const product = await updateProduct(decodeURIComponent(id), await parseBody(request, productUpdateSchema));
  await auditInventory(ctx, product.id, `Ubah barang inventory ${product.sku}`, product);
  return product;
});
