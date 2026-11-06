import { prisma } from "@/lib/db/prisma";
import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { type MjErrorCode, MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { mjStockAdjustmentSchema } from "@/lib/integrations/mj/validation";
import { InventoryError } from "@/lib/inventory/errors";
import { createAdjustment } from "@/lib/inventory/service";

export async function POST(request: Request) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const rawBody = await request.json().catch(() => null);
    const parsed = mjStockAdjustmentSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new MjIntegrationError("VALIDATION_FAILED", "Payload adjustment tidak valid.", 400, parsed.error.flatten());
    }

    const data = parsed.data;
    let locationId = data.location_id || data.locationId || data.warehouse_id || data.warehouseId!;
    if (/^\d+$/.test(locationId)) {
      const locByErp = await prisma.inventoryLocation.findFirst({
        where: { erpWarehouseId: Number(locationId) },
        select: { id: true }
      });
      if (locByErp) {
        locationId = locByErp.id;
      }
    }

    const items = data.items.map((item) => ({
      productId: item.product_id || item.productId,
      sku: item.sku,
      erpProductId: item.external_product_id ?? item.erp_product_id ?? item.erpProductId,
      quantity: item.quantity,
      unitCost: item.unit_cost ?? item.unitCost,
      notes: item.notes
    }));

    const idempotencyKey = data.idempotency_key || data.idempotencyKey;
    const adjustment = await createAdjustment(
      {
        adjustmentNumber: data.adjustment_number || data.adjustmentNumber,
        adjustmentDate: data.adjustment_date || data.adjustmentDate,
        locationId,
        reason: data.reason,
        notes: data.notes,
        idempotencyKey,
        items
      },
      { id: principal.clientId, name: `MJ Integration (${principal.clientCode})` }
    );

    const isReplay = Boolean(idempotencyKey && adjustment.idempotencyKey === idempotencyKey && (Date.now() - new Date(adjustment.createdAt).getTime()) > 5000);
    return Response.json({ success: true, data: adjustment }, { status: isReplay ? 200 : 201 });
  } catch (error) {
    const prismaCode = (error as { code?: string })?.code;
    if (prismaCode === "P2002") {
      const key = (error as { meta?: { target?: unknown } })?.meta?.target;
      return mjErrorResponse(new MjIntegrationError("REFERENCE_CONFLICT", "Data penyesuaian stok dengan nomor atau idempotency_key yang sama sudah ada.", 409, { target: key }));
    }
    if (error instanceof InventoryError) {
      let code: MjErrorCode = "VALIDATION_FAILED";
      if (error.code === "DUPLICATE") {
        code = "REFERENCE_CONFLICT";
      } else if (error.code === "NOT_FOUND" && /produk/i.test(error.message)) {
        code = "PRODUCT_INVALID";
      }
      return mjErrorResponse(new MjIntegrationError(code, error.message, error.status, error.details));
    }
    return mjErrorResponse(error);
  }
}
