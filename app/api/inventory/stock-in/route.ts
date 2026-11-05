import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { createStockIn } from "@/lib/inventory/service";
import { stockInSchema } from "@/lib/inventory/validation";

/** Barang masuk ke gudang/toko (mis. pembelian tanpa PO). */
export const POST = inventoryRoute("inventory.receive", async (request, ctx) => {
  const result = await createStockIn(await parseBody(request, stockInSchema), ctx.actor);
  await auditInventory(ctx, result.referenceNumber, `Barang masuk ${result.referenceNumber}`, { items: result.movements.length });
  return result;
}, { status: 201 });
