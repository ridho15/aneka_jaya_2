import { anikaRequest } from "@/lib/api/anikaClient";
import { recordAudit } from "@/lib/audit/store";
import { getCurrentUser } from "@/lib/auth/session";
import type { ApiResponse } from "@/lib/types/api";
import type { StockAdjustmentInput } from "@/lib/validation/stockAdjustmentSchema";

function toErpPayload(input: StockAdjustmentInput) {
  return {
    adjustment_number: input.adjustmentNumber || undefined,
    adjustment_date: input.adjustmentDate || undefined,
    warehouse_id: input.warehouseId,
    adjustment_type: input.adjustmentType,
    reason: input.reason,
    notes: input.notes || undefined,
    created_by: input.createdBy,
    approved_by: input.approvedBy,
    approve_now: input.approveNow,
    items: input.items.map((item) => ({
      product_id: item.productId,
      rak_id: item.rakId,
      current_qty: item.currentQty,
      adjusted_qty: item.adjustedQty,
      difference_qty: item.differenceQty,
      unit_cost: item.unitCost,
      difference_value: item.differenceValue,
      notes: item.notes || undefined
    }))
  };
}

export async function createStockAdjustment(input: StockAdjustmentInput): Promise<ApiResponse<unknown>> {
  const user = await getCurrentUser();
  const payload = toErpPayload(input);
  const response = await anikaRequest<unknown>("/stock-adjustments", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await recordAudit({
    entityType: "stock",
    entityId: input.adjustmentNumber || `ADJ-${Date.now()}`,
    action: response.success ? "update" : "retry_sync",
    afterValue: {
      warehouseId: input.warehouseId,
      adjustmentType: input.adjustmentType,
      approveNow: input.approveNow,
      itemCount: input.items.length,
      success: response.success,
      code: response.success ? undefined : response.code
    },
    reason: response.success
      ? `Stock adjustment terkirim ERP oleh ${user.name}`
      : `Stock adjustment gagal ERP • ${response.message}`
  });

  return response;
}
