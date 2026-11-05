import { inventoryRoute, auditInventory } from "@/lib/inventory/http";
import { receiveTransfer } from "@/lib/inventory/service";

export const POST = inventoryRoute<{ id: string }>("inventory.transfer", async (request, ctx, { id }) => {
  const body = (await request.json().catch(() => ({}))) as { receivedDate?: string };
  const transfer = await receiveTransfer(id, ctx.actor, body?.receivedDate);
  await auditInventory(ctx, transfer.id, `Terima transfer ${transfer.transferNumber}`);
  return transfer;
});
