import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { updateLocation } from "@/lib/inventory/service";
import { locationUpdateSchema } from "@/lib/inventory/validation";

export const PATCH = inventoryRoute<{ id: string }>("inventory.location", async (request, ctx, { id }) => {
  const location = await updateLocation(id, await parseBody(request, locationUpdateSchema));
  await auditInventory(ctx, location.id, `Ubah lokasi ${location.code}`, location);
  return location;
});
