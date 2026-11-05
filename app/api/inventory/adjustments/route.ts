import { inventoryRoute, parseBody, searchParams, auditInventory } from "@/lib/inventory/http";
import { createAdjustment, listAdjustments } from "@/lib/inventory/service";
import { adjustmentSchema } from "@/lib/inventory/validation";

export const GET = inventoryRoute("inventory.adjust", async (request) => {
  const q = searchParams(request);
  return listAdjustments({ locationId: q.get("locationId"), page: q.int("page"), pageSize: q.int("pageSize") });
});

/** Stock adjustment: quantity positif menambah, negatif mengurangi stok yang ada. */
export const POST = inventoryRoute("inventory.adjust", async (request, ctx) => {
  const adjustment = await createAdjustment(await parseBody(request, adjustmentSchema), ctx.actor);
  await auditInventory(ctx, adjustment.id, `Stock adjustment ${adjustment.adjustmentNumber}`, { reason: adjustment.reason, items: adjustment.items.length });
  return adjustment;
}, { status: 201 });
