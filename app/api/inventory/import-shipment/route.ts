import { z } from "zod";
import { inventoryRoute, auditInventory } from "@/lib/inventory/http";
import { InventoryError } from "@/lib/inventory/errors";
import { parseShipmentWorkbook, previewShipment, saveShipment } from "@/lib/inventory/shipmentImport";

export const maxDuration = 120;
const MAX_BYTES = 10 * 1024 * 1024;

const overridesSchema = z.record(z.object({
  pcsPerUnit: z.number().int().positive().max(10000).optional(),
  name: z.string().trim().max(120).optional()
}));

/**
 * Import packing list supplier (multipart/form-data).
 * Field: file (.xlsx), mode ("preview" | "save"), overrides (JSON per SKU), addStock ("true"), locationId, movementDate.
 * File diunggah ulang saat simpan, jadi server menghitung dari isi file yang sama dengan pratinjau.
 */
export const POST = inventoryRoute("inventory.master", async (request, ctx) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") throw new InventoryError("VALIDATION", "File Excel wajib diunggah.");
  if (file.size > MAX_BYTES) throw new InventoryError("VALIDATION", "Ukuran file maksimal 10 MB.");
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const parsed = await parseShipmentWorkbook(await file.arrayBuffer());
  if (text("mode") !== "save") return previewShipment(parsed);

  let overrides: z.infer<typeof overridesSchema> = {};
  try {
    overrides = overridesSchema.parse(JSON.parse(text("overrides") || "{}"));
  } catch {
    throw new InventoryError("VALIDATION", "Isian koreksi per barang tidak valid.");
  }
  const movementDate = text("movementDate");
  if (movementDate && Number.isNaN(Date.parse(movementDate))) throw new InventoryError("VALIDATION", "Tanggal barang masuk tidak valid.");
  const result = await saveShipment(parsed, {
    overrides,
    addStock: text("addStock") === "true",
    locationId: text("locationId"),
    movementDate
  }, ctx.actor);
  await auditInventory(ctx, `shipment-${parsed.fileHash}`, `Import packing list ${parsed.reference}: ${result.created} barang baru, ${result.updated} diperbarui`, result);
  return result;
});
