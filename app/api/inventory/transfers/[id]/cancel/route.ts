import { inventoryRoute, auditInventory } from "@/lib/inventory/http";
import { cancelTransfer } from "@/lib/inventory/service";

export const POST = inventoryRoute<{ id: string }>("inventory.transfer", async (request, ctx, { id }) => {
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const transfer = await cancelTransfer(id, ctx.actor, body?.reason);
  await auditInventory(ctx, transfer.id, `Batalkan transfer ${transfer.transferNumber}`);
  return transfer;
});
