import { inventoryRoute, parseBody, searchParams, auditInventory } from "@/lib/inventory/http";
import { createLocation, listLocations } from "@/lib/inventory/service";
import { locationSchema } from "@/lib/inventory/validation";

export const GET = inventoryRoute("inventory.stock.view", async (request) => {
  const q = searchParams(request);
  const type = q.get("type")?.toUpperCase();
  return listLocations({ type: type === "STORE" || type === "WAREHOUSE" ? type : undefined, includeInactive: q.bool("includeInactive") });
});

export const POST = inventoryRoute("inventory.location", async (request, ctx) => {
  const location = await createLocation(await parseBody(request, locationSchema));
  await auditInventory(ctx, location.id, `Tambah lokasi ${location.code}`, location);
  return location;
}, { status: 201 });
