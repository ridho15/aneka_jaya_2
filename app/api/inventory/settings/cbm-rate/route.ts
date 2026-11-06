import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { getCbmRate, setCbmRate } from "@/lib/inventory/pricing";
import { rmbRateSchema } from "@/lib/inventory/validation";

/** Tarif ongkir per CBM (Rp) yang dipakai menghitung modal barang impor. */
export const GET = inventoryRoute("inventory.master", async () => getCbmRate());

/** Ganti tarif CBM global. Modal barang tanpa tarif CBM khusus dihitung ulang. */
export const PUT = inventoryRoute("inventory.master", async (request, ctx) => {
  const { rate } = await parseBody(request, rmbRateSchema);
  const result = await setCbmRate(rate, ctx.actor);
  await auditInventory(ctx, "cbm-rate", `Tarif CBM ${result.previousRate ?? "-"} → ${rate}, ${result.updatedProducts} harga modal dihitung ulang`, result);
  return result;
});
