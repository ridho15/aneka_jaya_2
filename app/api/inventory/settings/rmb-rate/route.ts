import { inventoryRoute, parseBody, auditInventory } from "@/lib/inventory/http";
import { getRmbRate, setRmbRate } from "@/lib/inventory/pricing";
import { rmbRateSchema } from "@/lib/inventory/validation";

/** Kurs RMB → IDR yang dipakai menghitung harga modal barang berharga RMB. */
export const GET = inventoryRoute("inventory.view", async () => getRmbRate());

/** Ganti kurs RMB. Hanya HARGA MODAL barang yang punya harga RMB yang dihitung ulang. */
export const PUT = inventoryRoute("inventory.manage", async (request, ctx) => {
  const { rate } = await parseBody(request, rmbRateSchema);
  const result = await setRmbRate(rate, ctx.actor);
  await auditInventory(ctx, "rmb-rate", `Kurs RMB ${result.previousRate ?? "-"} → ${rate}, ${result.updatedProducts} harga modal dihitung ulang`, result);
  return result;
});
