import { inventoryRoute, auditInventory } from "@/lib/inventory/http";
import { InventoryError } from "@/lib/inventory/errors";
import { importOpnameWorkbook, parseOpnameWorkbook } from "@/lib/inventory/opnameImport";

export const maxDuration = 300;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Import stock opname dari file Excel (multipart/form-data).
 * Field: file (.xlsx), warehouseLocationId, storeLocationId, opnameDate (YYYY-MM-DD),
 * dryRun ("true" default), zeroUncounted ("true" default), updateMaster ("true" default).
 */
export const POST = inventoryRoute("inventory.import", async (request, ctx) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") throw new InventoryError("VALIDATION", "File Excel wajib diunggah.");
  if (file.size > MAX_BYTES) throw new InventoryError("VALIDATION", "Ukuran file maksimal 10 MB.");
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const flag = (key: string, fallback: boolean) => (text(key) === undefined ? fallback : ["1", "true", "yes", "on"].includes(text(key)!.toLowerCase()));
  const opnameDate = text("opnameDate");
  if (opnameDate && Number.isNaN(Date.parse(opnameDate))) throw new InventoryError("VALIDATION", "Tanggal opname tidak valid.");

  const parsed = await parseOpnameWorkbook(await file.arrayBuffer());
  const summary = await importOpnameWorkbook(parsed, {
    warehouseLocationId: text("warehouseLocationId"),
    storeLocationId: text("storeLocationId"),
    opnameDate,
    dryRun: flag("dryRun", true),
    zeroUncounted: flag("zeroUncounted", true),
    updateMaster: flag("updateMaster", true)
  }, ctx.actor);
  if (!summary.dryRun) {
    await auditInventory(ctx, `xlsx-${summary.fileHash}`, `Import opname Excel ${file.name}`, {
      rows: summary.totalRows, newProducts: summary.newProducts,
      warehouse: summary.warehouse?.documents, store: summary.store?.documents
    });
  }
  return summary;
});
