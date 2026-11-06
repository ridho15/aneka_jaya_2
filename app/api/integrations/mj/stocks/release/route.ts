import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { type MjErrorCode, MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { mjStockReleaseSchema } from "@/lib/integrations/mj/validation";
import { InventoryError } from "@/lib/inventory/errors";
import { releaseSaleStockLocal, type SaleStockItem } from "@/lib/inventory/service";

export async function POST(request: Request) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const rawBody = await request.json().catch(() => null);
    const parsed = mjStockReleaseSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new MjIntegrationError("VALIDATION_FAILED", "Payload pelepasan stok tidak valid.", 400, parsed.error.flatten());
    }

    const data = parsed.data;
    const defaultWarehouseId = data.warehouseId || data.warehouse_id;
    const items: SaleStockItem[] = data.items.map((item) => ({
      productId: item.productId || item.product_id,
      productRef: item.sku || item.productRef || item.product_ref,
      warehouseId: item.warehouseId || item.warehouse_id || item.locationId || item.location_id || defaultWarehouseId,
      quantity: item.quantity,
      allowNegative: false,
    }));

    const saleDate = data.saleDate || data.sale_date || new Date().toISOString().slice(0, 10);
    const sourceNumber = data.sourceNumber || data.source_number;

    const result = await releaseSaleStockLocal(
      {
        reference: data.reference,
        saleDate,
        sourceNumber,
        items,
      },
      { id: principal.clientId, name: `MJ Integration (${principal.clientCode})` },
    );

    const isReplay = result.status === "already_released";
    return Response.json(
      {
        success: true,
        data: {
          status: result.status,
          releaseReference: data.reference,
        },
      },
      { status: isReplay ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof InventoryError) {
      let code: MjErrorCode = "VALIDATION_FAILED";
      if (error.code === "DUPLICATE") {
        code = "REFERENCE_CONFLICT";
      } else if (error.code === "INSUFFICIENT_STOCK") {
        code = "STOCK_INSUFFICIENT";
      } else if (error.code === "NOT_FOUND" && /produk/i.test(error.message)) {
        code = "PRODUCT_INVALID";
      }
      return mjErrorResponse(new MjIntegrationError(code, error.message, error.status, error.details));
    }
    return mjErrorResponse(error);
  }
}
