import { authenticateMjRequest } from "@/lib/integrations/mj/auth";
import { type MjErrorCode, MjIntegrationError, mjErrorResponse } from "@/lib/integrations/mj/errors";
import { mjStockCancelSchema } from "@/lib/integrations/mj/validation";
import { InventoryError } from "@/lib/inventory/errors";
import { cancelSaleStockLocal } from "@/lib/inventory/service";

export async function POST(request: Request) {
  try {
    const principal = await authenticateMjRequest(request, "mutation");
    const rawBody = await request.json().catch(() => null);
    const parsed = mjStockCancelSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new MjIntegrationError("VALIDATION_FAILED", "Payload pembatalan rilis stok tidak valid.", 400, parsed.error.flatten());
    }

    const data = parsed.data;
    const result = await cancelSaleStockLocal(
      {
        reference: data.reference,
        reason: data.reason || "Pembatalan rilis stok kasir",
        mustExist: true,
      },
      { id: principal.clientId, name: `MJ Integration (${principal.clientCode})` },
    );

    return Response.json(
      {
        success: true,
        data: {
          status: result.status,
          reference: data.reference,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof InventoryError) {
      let code: MjErrorCode = "VALIDATION_FAILED";
      if (error.code === "DUPLICATE") {
        code = "REFERENCE_CONFLICT";
      }
      return mjErrorResponse(new MjIntegrationError(code, error.message, error.status, error.details));
    }
    return mjErrorResponse(error);
  }
}
