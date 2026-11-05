import { inventoryRoute, parseBody, searchParams, auditInventory } from "@/lib/inventory/http";
import { createOpname, listOpnames } from "@/lib/inventory/service";
import { opnameSchema } from "@/lib/inventory/validation";

export const GET = inventoryRoute("inventory.opname", async (request) => {
  const q = searchParams(request);
  return listOpnames({ locationId: q.get("locationId"), page: q.int("page"), pageSize: q.int("pageSize") });
});

/** Stock opname: stok sistem DIGANTI dengan hasil hitung fisik (countedQty). */
export const POST = inventoryRoute("inventory.opname", async (request, ctx) => {
  const opname = await createOpname(await parseBody(request, opnameSchema), ctx.actor);
  await auditInventory(ctx, opname.id, `Stock opname ${opname.opnameNumber}`, { items: opname.items.length });
  return opname;
}, { status: 201 });
