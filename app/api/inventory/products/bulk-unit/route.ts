import { z } from "zod";
import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { bulkChangeUnit, listUnitUsage } from "@/lib/inventory/service";

const schema = z.object({
  fromUnit: z.string().trim().min(1).max(20),
  toUnit: z.string().trim().min(1, "Satuan baru wajib diisi").max(20),
  category: z.string().trim().max(120).optional()
});

/** Daftar satuan yang dipakai + jumlah barang. */
export const GET = inventoryRoute("inventory.master", async () => listUnitUsage());

/** Ubah satuan massal, mis. semua "PCS" → "Lusin". Hanya label satuan; qty tidak dikonversi. */
export const POST = inventoryRoute("inventory.master", async (request, ctx) => {
  const result = await bulkChangeUnit(await parseBody(request, schema));
  await auditInventory(ctx, "bulk-unit", `Ubah satuan massal ${result.fromUnit} → ${result.toUnit} (${result.updated} barang)`, result);
  return result;
});
