import { inventoryRoute, parseBody, searchParams, auditInventory } from "@/lib/inventory/http";
import { createTransfer, listTransfers } from "@/lib/inventory/service";
import { transferSchema } from "@/lib/inventory/validation";

export const GET = inventoryRoute("inventory.view", async (request) => {
  const q = searchParams(request);
  const status = q.get("status")?.toUpperCase();
  return listTransfers({
    status: status === "IN_TRANSIT" || status === "RECEIVED" || status === "CANCELLED" ? status : undefined,
    locationId: q.get("locationId"),
    page: q.int("page"),
    pageSize: q.int("pageSize")
  });
});

export const POST = inventoryRoute("inventory.transfer", async (request, ctx) => {
  const transfer = await createTransfer(await parseBody(request, transferSchema), ctx.actor);
  await auditInventory(ctx, transfer.id, `Transfer stok ${transfer.transferNumber}`, { status: transfer.status, items: transfer.items.length });
  return transfer;
}, { status: 201 });
