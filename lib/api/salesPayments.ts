import "server-only";
import { anikaRequest } from "@/lib/api/anikaClient";
import { failure, type ApiResponse } from "@/lib/types/api";

type ErpInvoiceLookup = {
  id?: unknown;
  invoice_id?: unknown;
  invoice_number?: unknown;
  invoice_date?: unknown;
  customer_id?: unknown;
  customer?: { id?: unknown };
  party?: { id?: unknown };
  totals?: { total?: unknown; remaining?: unknown };
  data?: unknown;
};

export type ErpInvoicePaymentStatus = {
  invoiceId?: number;
  invoiceNumber?: string;
  customerId?: number;
  remaining?: number;
  total?: number;
  invoiceDate?: string;
  settlementStatus?: string;
  raw?: unknown;
};

export type SalesPaymentPayloadInput = {
  erpReference: string;
  invoiceId: number;
  customerId: number;
  paymentDate: string;
  coaId?: string;
  coaCode?: string;
  paymentAccountCode?: string;
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
  const nestedData = asRecord(data)?.data;
  if (Array.isArray(nestedData)) return nestedData;
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
  const party = asRecord(row.party);
  const totals = asRecord(row.totals);
  return {
    invoiceId: numberId(row.id) ?? numberId(row.invoice_id),
    invoiceNumber: firstString(row.invoice_number),
    customerId: numberId(row.customer_id) ?? numberId(customer?.id) ?? numberId(party?.id),
    remaining: moneyNumber(totals?.remaining),
    total: moneyNumber(totals?.total),
    invoiceDate: firstString(row.invoice_date),
    raw: value,
  };
}

function statusFrom(value: unknown): ErpInvoicePaymentStatus {
  const firstRow = dataRows(value)[0];
  const row = asRecord(value);
  const nested = asRecord(firstRow) || asRecord(row?.data) || row;
  const invoice = invoiceFrom(nested) || invoiceFrom(value) || {};
  return {
    ...invoice,
    remaining:
      moneyNumber(nested?.remaining) ??
      moneyNumber(nested?.remaining_receivable) ??
      moneyNumber(nested?.sisa_piutang) ??
      moneyNumber(nested?.outstanding) ??
      invoice.remaining,
    settlementStatus: firstString(
      nested?.settlement_status,
      nested?.payment_status,
      nested?.status,
    ),
    raw: value,
  };
}

export function buildSalesPaymentPayload(input: SalesPaymentPayloadInput) {
  const accountCode = String(input.paymentAccountCode || input.coaCode || input.coaId || "").trim();
  if (!input.erpReference.trim())
    return failure(
      "Referensi payment ERP dari SLM belum tersedia.",
      "ERP_PAYMENT_REFERENCE_MISSING",
    );
  if (!accountCode)
    return failure(
      "COA code / payment account code ERP rekening penerima belum diatur.",
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
      erp_reference: input.erpReference,
      customer_id: input.customerId,
      payment_date: input.paymentDate,
      ...(input.coaId && numberId(input.coaId) ? { coa_id: numberId(input.coaId) } : /^[0-9.]+$/.test(accountCode) ? { coa_code: accountCode } : { payment_account_code: accountCode }),
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

export async function findErpInvoiceForCustomerPayment(input: {
  customerId: number;
  paymentDate?: string;
  amount?: number;
}): Promise<ApiResponse<ErpInvoicePaymentStatus>> {
  if (!input.customerId)
    return failure(
      "Customer ERP invoice belum ditemukan untuk payment.",
      "ERP_PAYMENT_CUSTOMER_MISSING",
    );
  const response = await anikaRequest<unknown>(
    `/invoices?customer_id=${encodeURIComponent(String(input.customerId))}&per_page=20&page=1`,
  );
  if (!response.success) return response;
  const invoices = dataRows(response.data)
    .map(invoiceFrom)
    .filter((item): item is ErpInvoicePaymentStatus => Boolean(item?.invoiceId));
  const sameDate = input.paymentDate
    ? invoices.filter((item) => item.invoiceDate === input.paymentDate)
    : invoices;
  const sameAmount = input.amount
    ? sameDate.filter((item) => item.remaining === input.amount || item.total === input.amount)
    : sameDate;
  const match = sameAmount[0] || sameDate[0] || invoices[0];
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

function safeSalesPaymentError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const message = response.message || "Payment ERP gagal dibuat.";
  const details = asRecord(response.details);
  const upstreamCode = String(details?.upstreamCode || response.code || "").toLowerCase();
  const lowerMessage = message.toLowerCase();
  if (upstreamCode.includes("coa") || lowerMessage.includes("coa")) {
    return "COA code / payment account code rekening penerima tidak valid di Aneka Jaya. Periksa Pengaturan → Rekening.";
  }
  if (lowerMessage.includes("selected invoices") || lowerMessage.includes("invoice")) {
    return "Invoice ERP tidak valid atau belum memiliki piutang untuk payment.";
  }
  if (lowerMessage.includes("amount") || lowerMessage.includes("melebihi")) {
    return "Nominal payment ERP tidak valid atau melebihi sisa piutang invoice.";
  }
  return message;
}

function paymentReferenceFrom(value: unknown) {
  const row = asRecord(value);
  const data = asRecord(row?.data);
  return firstString(
    row?.erp_reference,
    data?.erp_reference,
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
  if (!payload.success) return payload;
  const response = await anikaRequest<unknown>("/sales-payments", {
    method: "POST",
    body: JSON.stringify(payload.data),
  });
  if (!response.success)
    return failure(
      safeSalesPaymentError(response) || "Payment ERP gagal dibuat.",
      response.code || "ERP_PAYMENT_FAILED",
      response.details,
    );
  const row = asRecord(response.data);
  const data = asRecord(row?.data);
  const normalizedStatus = String(data?.payment_status || data?.status || row?.payment_status || row?.status || "")
    .trim()
    .toLowerCase();
  const status =
    normalizedStatus === "partial" || normalizedStatus === "partially_paid"
      ? "partial"
      : "paid";
  const topStatus = String(row?.status || "").trim().toLowerCase();
  if (topStatus === "already_processed") {
    return { success: true, data: { paymentReference: paymentReferenceFrom(response.data) || input.erpReference, status, raw: response.data } };
  }
  return {
    success: true,
    data: {
      paymentReference: paymentReferenceFrom(response.data) || input.erpReference,
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
  const accountCode = String(input.paymentAccountCode || input.coaCode || input.coaId || "").trim();
  if (!input.erpReference.trim())
    return failure(
      "Referensi payment ERP dari SLM belum tersedia.",
      "ERP_PAYMENT_REFERENCE_MISSING",
    );
  if (!accountCode)
    return failure(
      "COA code / payment account code ERP rekening penerima belum diatur.",
      "ERP_PAYMENT_COA_MISSING",
    );
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return failure(
      "Nominal payment ERP harus lebih dari 0.",
      "ERP_PAYMENT_AMOUNT_INVALID",
    );
  const before = await getErpInvoicePaymentStatus(input.invoiceNumber);
  if (before.success && isInvoiceAlreadyPaid(before.data)) {
    return { success: true, data: { status: "paid", paymentReference: input.erpReference, skipped: true, raw: before.data.raw } };
  }
  const invoice =
    before.success && before.data.invoiceId
      ? before
      : input.invoiceId && input.customerId
        ? { success: true as const, data: { invoiceId: input.invoiceId, customerId: input.customerId, invoiceNumber: input.invoiceNumber } }
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
