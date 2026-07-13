import "server-only";
import { anikaRequest } from "@/lib/api/anikaClient";
import { failure, type ApiResponse } from "@/lib/types/api";

type ErpInvoiceLookup = {
  id?: unknown;
  invoice_id?: unknown;
  invoice_number?: unknown;
  customer_id?: unknown;
  customer?: { id?: unknown };
  data?: unknown;
};

export type ErpInvoicePaymentStatus = {
  invoiceId?: number;
  invoiceNumber?: string;
  customerId?: number;
  remaining?: number;
  settlementStatus?: string;
  raw?: unknown;
};

export type SalesPaymentPayloadInput = {
  invoiceId: number;
  customerId: number;
  paymentDate: string;
  coaId: string;
  paymentMethod: string;
  amount: number;
  notes?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function dataRows(value: unknown): unknown[] {
  const row = asRecord(value);
  const data = row?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim()))
    return Number(value.trim());
  return undefined;
}

function moneyNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function invoiceFrom(value: unknown): ErpInvoicePaymentStatus | undefined {
  const row = asRecord(value) as ErpInvoiceLookup | undefined;
  if (!row) return undefined;
  const customer = asRecord(row.customer);
  return {
    invoiceId: numberId(row.id) ?? numberId(row.invoice_id),
    invoiceNumber: firstString(row.invoice_number),
    customerId: numberId(row.customer_id) ?? numberId(customer?.id),
    raw: value,
  };
}

function statusFrom(value: unknown): ErpInvoicePaymentStatus {
  const row = asRecord(value);
  const nested = asRecord(row?.data) || row;
  const invoice = invoiceFrom(nested) || invoiceFrom(value) || {};
  return {
    ...invoice,
    remaining:
      moneyNumber(nested?.remaining) ??
      moneyNumber(nested?.remaining_receivable) ??
      moneyNumber(nested?.sisa_piutang) ??
      moneyNumber(nested?.outstanding),
    settlementStatus: firstString(
      nested?.settlement_status,
      nested?.payment_status,
      nested?.status,
    ),
    raw: value,
  };
}

export function buildSalesPaymentPayload(input: SalesPaymentPayloadInput) {
  const coaId = numberId(input.coaId);
  if (!coaId)
    return failure(
      "COA ERP rekening penerima belum valid.",
      "ERP_PAYMENT_COA_MISSING",
    );
  if (!input.invoiceId)
    return failure(
      "Invoice ERP belum ditemukan untuk payment.",
      "ERP_PAYMENT_INVOICE_MISSING",
    );
  if (!input.customerId)
    return failure(
      "Customer ERP invoice belum ditemukan untuk payment.",
      "ERP_PAYMENT_CUSTOMER_MISSING",
    );
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return failure(
      "Nominal payment ERP harus lebih dari 0.",
      "ERP_PAYMENT_AMOUNT_INVALID",
    );
  return {
    success: true as const,
    data: {
      customer_id: input.customerId,
      payment_date: input.paymentDate,
      coa_id: coaId,
      payment_method:
        input.paymentMethod === "TF" ? "Transfer" : input.paymentMethod,
      total_payment: input.amount,
      selected_invoices: [input.invoiceId],
      notes: input.notes || "Pembayaran invoice dari SLM",
    },
  };
}

export async function findErpInvoiceByNumber(
  invoiceNumber?: string,
): Promise<ApiResponse<ErpInvoicePaymentStatus>> {
  if (!invoiceNumber)
    return failure(
      "Nomor invoice ERP belum tersedia.",
      "ERP_PAYMENT_INVOICE_MISSING",
    );
  const response = await anikaRequest<unknown>(
    `/invoices?invoice_number=${encodeURIComponent(invoiceNumber)}`,
  );
  if (!response.success) return response;
  const match = dataRows(response.data)
    .map(invoiceFrom)
    .find((item) => item?.invoiceId);
  if (!match?.invoiceId)
    return failure(
      "Invoice ERP tidak ditemukan untuk payment.",
      "ERP_PAYMENT_INVOICE_MISSING",
      response.data,
    );
  return { success: true, data: match };
}

export async function getErpInvoicePaymentStatus(
  invoiceNumber?: string,
): Promise<ApiResponse<ErpInvoicePaymentStatus>> {
  if (!invoiceNumber)
    return failure(
      "Nomor invoice ERP belum tersedia.",
      "ERP_PAYMENT_INVOICE_MISSING",
    );
  const response = await anikaRequest<unknown>(
    `/invoices/payment-status?invoice_number=${encodeURIComponent(invoiceNumber)}`,
  );
  if (!response.success) return response;
  return { success: true, data: statusFrom(response.data) };
}

export function isInvoiceAlreadyPaid(status: ErpInvoicePaymentStatus) {
  const normalized = String(status.settlementStatus || "")
    .trim()
    .toLowerCase();
  return (
    status.remaining === 0 || normalized === "paid" || normalized === "lunas"
  );
}

function paymentReferenceFrom(value: unknown) {
  const row = asRecord(value);
  const data = asRecord(row?.data);
  const reference = firstString(
    row?.id,
    data?.id,
    row?.payment_id,
    data?.payment_id,
  );
  return (
    reference ??
    (
      numberId(row?.id) ??
      numberId(data?.id) ??
      numberId(row?.payment_id) ??
      numberId(data?.payment_id)
    )?.toString()
  );
}

export async function createErpSalesPayment(
  input: SalesPaymentPayloadInput,
): Promise<
  ApiResponse<{
    paymentReference?: string;
    status: "paid" | "partial";
    raw: unknown;
  }>
> {
  const payload = buildSalesPaymentPayload(input);
  console.log('Payload', payload);
  if (!payload.success) return payload;
  const response = await anikaRequest<unknown>("/sales-payments", {
    method: "POST",
    body: JSON.stringify(payload.data),
  });
  if (!response.success)
    return failure(
      response.message || "Payment ERP gagal dibuat.",
      response.code || "ERP_PAYMENT_FAILED",
      response.details,
    );
  const row = asRecord(response.data);
  const data = asRecord(row?.data);
  const status =
    String(data?.status || row?.status || "")
      .trim()
      .toLowerCase() === "partial"
      ? "partial"
      : "paid";
  return {
    success: true,
    data: {
      paymentReference: paymentReferenceFrom(response.data),
      status,
      raw: response.data,
    },
  };
}

export async function syncErpSalesPayment(
  input: SalesPaymentPayloadInput & { invoiceNumber?: string },
): Promise<
  ApiResponse<{
    paymentReference?: string;
    status: "paid" | "partial";
    skipped?: boolean;
    raw?: unknown;
  }>
> {
  if (!numberId(input.coaId))
    return failure(
      "COA ERP rekening penerima belum valid.",
      "ERP_PAYMENT_COA_MISSING",
    );
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return failure(
      "Nominal payment ERP harus lebih dari 0.",
      "ERP_PAYMENT_AMOUNT_INVALID",
    );
  const before = await getErpInvoicePaymentStatus(input.invoiceNumber);
  if (before.success && isInvoiceAlreadyPaid(before.data)) {
    return {
      success: true,
      data: { status: "paid", skipped: true, raw: before.data.raw },
    };
  }
  const invoice =
    before.success && before.data.invoiceId
      ? before
      : await findErpInvoiceByNumber(input.invoiceNumber);
  if (!invoice.success) return invoice;
  const invoiceId = invoice.data.invoiceId || input.invoiceId;
  const customerId = input.customerId || invoice.data.customerId;
  if (!invoiceId)
    return failure(
      "Invoice ERP belum ditemukan untuk payment.",
      "ERP_PAYMENT_INVOICE_MISSING",
      invoice.data.raw,
    );
  if (!customerId)
    return failure(
      "Customer ERP invoice belum ditemukan untuk payment.",
      "ERP_PAYMENT_CUSTOMER_MISSING",
      invoice.data.raw,
    );
  return createErpSalesPayment({ ...input, invoiceId, customerId });
}
