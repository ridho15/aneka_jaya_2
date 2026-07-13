import "server-only";
import { anikaRequest } from "@/lib/api/anikaClient";
import { failure, type ApiResponse } from "@/lib/types/api";
import type { Sale } from "@/lib/types/sales";

export type StockReleaseResult = {
  status: "released" | "already_released";
  message?: string;
  data?: unknown;
};

type ReleaseItemInput = Sale["items"][number];

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function releaseReferenceFor(saleId: string, erpReference?: string) {
  return `SLM-STOCK-${erpReference || saleId}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

function safeReleaseError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const details = response.details && typeof response.details === "object" ? response.details as Record<string, unknown> : {};
  const upstreamCode = typeof details.upstreamCode === "string" ? details.upstreamCode : "";
  const code = upstreamCode || response.code || "";
  const map: Record<string, string> = {
    stock_insufficient: "Stok ERP tidak cukup untuk release.",
    warehouse_invalid: "Gudang ERP tidak valid atau tidak aktif.",
    rak_invalid: "Rak ERP tidak valid atau bukan milik gudang.",
    product_invalid: "Produk ERP tidak ditemukan untuk release stok.",
    hpp_invalid: "HPP/cost produk belum valid di ERP.",
    coa_invalid: "COA produk belum valid di ERP.",
    validation_failed: "Payload release stok ERP tidak valid."
  };
  return map[code] || response.message || "Release stok ERP gagal.";
}

export function buildStockReleasePayload(input: {
  saleId: string;
  saleDate: string;
  erpReference?: string;
  sourceNumber?: string;
  items: ReleaseItemInput[];
}) {
  const releaseReference = releaseReferenceFor(input.saleId, input.erpReference);
  const releaseItems = input.items.map((item) => {
    const productId = numberId(item.productId);
    const warehouseId = numberId(item.warehouseId);
    const rackId = numberId(item.rackId);
    return {
      product_id: productId,
      sku: item.productRef || undefined,
      quantity: item.quantity,
      warehouse_id: warehouseId,
      rak_id: rackId
    };
  });

  const missingWarehouse = input.items.find((item) => !numberId(item.warehouseId));
  if (missingWarehouse) return failure(`Gudang release stok belum dipilih untuk ${missingWarehouse.productRef}.`, "ERP_STOCK_RELEASE_INCOMPLETE");
  const missingProduct = input.items.find((item) => !numberId(item.productId) && !item.productRef);
  if (missingProduct) return failure("Produk release stok belum lengkap.", "ERP_STOCK_RELEASE_INCOMPLETE");

  return {
    success: true as const,
    data: {
      releaseReference,
      payload: {
        erp_reference: releaseReference,
        source: "SLM",
        source_type: "invoice",
        source_number: input.sourceNumber || input.erpReference || input.saleId,
        release_date: input.saleDate,
        warehouse_id: releaseItems[0]?.warehouse_id,
        notes: `Release stok dari invoice SLM ${input.erpReference || input.saleId}`,
        items: releaseItems
      }
    }
  };
}

export async function releaseSaleStock(input: {
  saleId: string;
  saleDate: string;
  erpReference?: string;
  sourceNumber?: string;
  items: ReleaseItemInput[];
}): Promise<ApiResponse<StockReleaseResult & { releaseReference: string }>> {
  const built = buildStockReleasePayload(input);
  if (!built.success) return built;
  const response = await anikaRequest<StockReleaseResult>("/stock-releases", {
    method: "POST",
    body: JSON.stringify(built.data.payload)
  });
  if (!response.success) return failure(safeReleaseError(response) || "Release stok ERP gagal.", response.code, response.details);
  const status = String((response.data as { status?: unknown })?.status || "").trim();
  if (status === "released" || status === "already_released") {
    return { success: true, data: { ...response.data, status, releaseReference: built.data.releaseReference } };
  }
  return failure(response.data?.message || "Release stok ERP belum terkonfirmasi.", "ERP_STOCK_RELEASE_UNCONFIRMED", response.data);
}

export function stockReleaseErrorFrom(response: ApiResponse<unknown>) {
  return safeReleaseError(response);
}
