import { z } from "zod";
import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { postPurchaseReceiptToInventory } from "@/lib/inventory/service";

/** Masukkan penerimaan barang pembelian (GRN) ke stok gudang/toko. Aman diulang. */
export const POST = inventoryRoute<{ id: string }>("inventory.manage", async (request, ctx, { id }) => {
  const { locationId } = await parseBody(request, z.object({ locationId: z.string().min(1, "Lokasi wajib dipilih") }));
  const receipt = await postPurchaseReceiptToInventory(id, locationId, ctx.actor);
  await auditInventory(ctx, receipt.id, `Posting GRN ${receipt.grnNumber} ke inventory`);
  return receipt;
});
