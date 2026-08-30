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
  const ref = erpReference || saleId;
  if (ref.startsWith("SLM-STOCK-")) {
    return ref.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
  }
  return `SLM-STOCK-${ref}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

function safeReleaseError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const details = response.details && typeof response.details === "object" ? response.details as Record<string, unknown> : {};
  const upstreamCode = typeof details.upstreamCode === "string" ? details.upstreamCode : "";
  const code = upstreamCode || response.code || "";

  if (code === "stock_insufficient") {
    const errors = details.errors as Record<string, unknown> | undefined;
    const items = Array.isArray(errors?.items) ? errors.items as Record<string, unknown>[] : [];
    if (items.length > 0) {
      const itemDescriptions = items.map((i) => {
        const name = String(i.product_name || i.sku || i.product_id || "Produk");
        const req = i.requested_qty !== undefined ? ` (minta: ${i.requested_qty}, tersedia: ${i.available_qty ?? 0})` : "";
        return `${name}${req}`;
      });
      return `Stok di gudang tidak mencukupi untuk item: ${itemDescriptions.join(", ")}.`;
    }
    return "Stok di gudang tidak mencukupi untuk release barang.";
  }

  if (code === "product_invalid") {
    const errors = details.errors as unknown[];
    if (Array.isArray(errors) && errors.length > 0) {
      const invalidSkus = errors.map((e: any) => e.sku || (e.product_id ? `ID #${e.product_id}` : "Produk")).join(", ");
      return `Produk berikut tidak ditemukan di master data ERP Aneka Jaya: ${invalidSkus}.`;
    }
    return "Produk ERP tidak ditemukan untuk release stok.";
  }

  const map: Record<string, string> = {
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
  const defaultWarehouseId = numberId(process.env.ANIKA_ERP_DEFAULT_WAREHOUSE_ID) || numberId(process.env.ANIKA_ERP_DEFAULT_CABANG_ID) || 1;
  const releaseReference = releaseReferenceFor(input.saleId, input.erpReference);
  const releaseItems = input.items.map((item) => {
    const productId = numberId(item.productId);
    const warehouseId = numberId(item.warehouseId) || defaultWarehouseId;
    const rackId = numberId(item.rackId);
    return {
      product_id: productId,
      sku: item.productRef || undefined,
      quantity: item.quantity,
      warehouse_id: warehouseId,
      rak_id: rackId
    };
  });

  const missingProduct = input.items.find((item) => !numberId(item.productId) && !item.productRef);
  if (missingProduct) return failure("Produk release stok belum lengkap.", "ERP_STOCK_RELEASE_INCOMPLETE");

  return {
    success: true as const,
    data: {
      releaseReference,
      payload: {
        reference: releaseReference,
        erp_reference: releaseReference,
        source: "SLM",
        source_type: "invoice",
        source_number: input.sourceNumber || input.erpReference || input.saleId,
        release_date: input.saleDate,
        warehouse_id: releaseItems[0]?.warehouse_id || defaultWarehouseId,
        notes: `Release stok dari transaksi SLM ${input.sourceNumber || input.erpReference || input.saleId}`,
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
    return { success: true, data: { ...response.data, status, releaseReference: built.data.releaseReference }, details: response.details };
  }
  return failure(response.data?.message || "Release stok ERP belum terkonfirmasi.", "ERP_STOCK_RELEASE_UNCONFIRMED", response.data);
}

export async function cancelStockRelease(input: {
  reference: string;
  reason: string;
}): Promise<ApiResponse<{ status: "reversed"; message?: string }>> {
  const response = await anikaRequest<{ status?: string; message?: string }>("/stock-releases/cancel", {
    method: "POST",
    body: JSON.stringify({
      reference: input.reference,
      reason: input.reason
    })
  });
  if (!response.success) {
    return failure(response.message || "Gagal membatalkan rilis stok di ERP.", response.code, response.details);
  }
  return {
    success: true,
    data: {
      status: "reversed",
      message: response.data?.message
    },
    details: response.details
  };
}

export function nextRevisionReference(currentRef?: string, baseReference?: string) {
  const base = currentRef || baseReference || `SLM-STOCK-${Date.now()}`;
  const match = base.match(/-REV(\d+)$/i);
  if (match) {
    const revNum = parseInt(match[1], 10) + 1;
    return base.replace(/-REV\d+$/i, `-REV${revNum}`);
  }
  return `${base}-REV1`;
}

export function stockReleaseErrorFrom(response: ApiResponse<unknown>) {
  return safeReleaseError(response);
}
