import type { InventoryMovementType } from "@prisma/client";
import { inventoryRoute, searchParams } from "@/lib/inventory/http";
import { listMovements } from "@/lib/inventory/service";

const TYPES = ["INITIAL", "PURCHASE_RECEIPT", "TRANSFER_OUT", "TRANSFER_IN", "OPNAME", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "SALE_OUT", "SALE_REVERSAL"];

/** Mutasi stok / kartu stok. */
export const GET = inventoryRoute("inventory.movement.view", async (request) => {
  const q = searchParams(request);
  const type = q.get("type")?.toUpperCase();
  return listMovements({
    productId: q.get("productId"),
    sku: q.get("sku"),
    locationId: q.get("locationId"),
    type: type && TYPES.includes(type) ? (type as InventoryMovementType) : undefined,
    referenceNumber: q.get("reference"),
    from: q.get("from"),
    to: q.get("to"),
    page: q.int("page"),
    pageSize: q.int("pageSize")
  });
});
