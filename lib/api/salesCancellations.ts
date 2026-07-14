import "server-only";
import { anikaRequest } from "@/lib/api/anikaClient";
import { failure, type ApiResponse } from "@/lib/types/api";

type RequestedBy = {
  id: string;
  name: string;
  role: string;
};

export type SalesCancellationInput = {
  erpReference: string;
  sourceNumber?: string;
  invoiceId?: number;
  saleReference: string;
  stockReleaseReference?: string;
  paymentReference?: string;
  cancelDate: string;
  reason: string;
  requestedBy: RequestedBy;
};

export type SalesCancellationResult = {
  status: "cancelled" | "already_cancelled";
  invoiceId?: number;
  invoiceNumber?: string;
  invoiceStatus?: string;
  stockReversalStatus?: string;
  paymentReversalStatus?: string;
  journalReversalStatus?: string;
  reversalReference?: string;
  raw: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function cancellationResultFrom(value: unknown): SalesCancellationResult {
  const row = asRecord(value);
  const data = asRecord(row?.data);
  const normalizedStatus = String(row?.status || data?.status || "")
    .trim()
    .toLowerCase();
  return {
    status: normalizedStatus === "already_cancelled" ? "already_cancelled" : "cancelled",
    invoiceId: numberId(data?.invoice_id ?? row?.invoice_id),
    invoiceNumber: firstString(data?.invoice_number, row?.invoice_number),
    invoiceStatus: firstString(data?.invoice_status, row?.invoice_status),
    stockReversalStatus: firstString(data?.stock_reversal_status, row?.stock_reversal_status),
    paymentReversalStatus: firstString(data?.payment_reversal_status, row?.payment_reversal_status),
    journalReversalStatus: firstString(data?.journal_reversal_status, row?.journal_reversal_status),
    reversalReference: firstString(data?.reversal_reference, row?.reversal_reference),
    raw: value,
  };
}

function buildSalesCancellationPayload(input: SalesCancellationInput) {
  if (!input.erpReference.trim()) {
    return failure("Referensi cancel ERP dari SLM belum tersedia.", "ERP_CANCEL_REFERENCE_MISSING");
  }
  if (!input.saleReference.trim()) {
    return failure("Referensi transaksi SLM belum tersedia untuk cancel ERP.", "ERP_CANCEL_SALE_REFERENCE_MISSING");
  }
  if (!input.sourceNumber?.trim() && !input.invoiceId) {
    return failure("Nomor invoice ERP belum tersedia untuk cancel.", "ERP_CANCEL_INVOICE_MISSING");
  }
  if (!input.reason.trim()) {
    return failure("Alasan cancel wajib diisi.", "ERP_CANCEL_REASON_MISSING");
  }
  return {
    success: true as const,
    data: {
      erp_reference: input.erpReference,
      source: "SLM",
      source_type: "invoice",
      source_number: input.sourceNumber || undefined,
      invoice_id: input.invoiceId || undefined,
      sale_reference: input.saleReference,
      stock_release_reference: input.stockReleaseReference || undefined,
      payment_reference: input.paymentReference || undefined,
      cancel_date: input.cancelDate,
      reason: input.reason,
      requested_by: input.requestedBy,
    },
  };
}

function safeSalesCancellationError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const message = response.message || "Cancel transaksi ERP gagal.";
  const details = asRecord(response.details);
  const upstreamCode = String(details?.upstreamCode || response.code || "").toLowerCase();
  const lowerMessage = message.toLowerCase();
  if (upstreamCode.includes("invoice_not_found") || lowerMessage.includes("invoice")) {
    return "Invoice ERP tidak ditemukan untuk cancel.";
  }
  if (upstreamCode.includes("not_cancellable")) {
    return "Invoice ERP tidak bisa dibatalkan.";
  }
  if (upstreamCode.includes("stock")) {
    return "ERP gagal membalik release stok.";
  }
  if (upstreamCode.includes("payment")) {
    return "ERP gagal membalik payment/customer receipt.";
  }
  if (upstreamCode.includes("journal")) {
    return "ERP gagal membuat jurnal reversal.";
  }
  return message;
}

export async function cancelErpSales(
  input: SalesCancellationInput,
): Promise<ApiResponse<SalesCancellationResult>> {
  const payload = buildSalesCancellationPayload(input);
  if (!payload.success) return payload;

  const response = await anikaRequest<unknown>("/sales-cancellations", {
    method: "POST",
    body: JSON.stringify(payload.data),
  });
  if (!response.success) {
    return failure(
      safeSalesCancellationError(response) || "Cancel transaksi ERP gagal.",
      response.code || "ERP_CANCEL_FAILED",
      response.details,
    );
  }
  return { success: true, data: cancellationResultFrom(response.data) };
}
