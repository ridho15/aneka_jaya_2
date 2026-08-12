import "server-only";
import { anikaRequest } from "@/lib/api/anikaClient";
import { listErpPaginated } from "@/lib/api/pagination";
import { erpInvoiceIdentityFrom, erpReferenceFrom } from "@/lib/api/sales";
import { releaseSaleStock } from "@/lib/api/stockReleases";
import { createErpSalesPayment } from "@/lib/api/salesPayments";
import type { ApiResponse } from "@/lib/types/api";
import type { MjAjInvoiceInput } from "./validation";

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export type MjErpCustomer = { id: number; code?: string; name: string; address?: string };

export async function listMjErpCustomers(search = ""): Promise<ApiResponse<MjErpCustomer[]>> {
  const response = await listErpPaginated("/customers", { maxPages: 3, query: search ? { name: search } : {} });
  if (!response.success) return response;
  return {
    success: true,
    data: (response.data as unknown[]).map((value) => record(value)).flatMap((row): MjErpCustomer[] => {
      const id = numberId(row?.id);
      const name = typeof row?.name === "string" ? row.name : "";
      if (!id || !name) return [];
      return [{ id, code: typeof row?.code === "string" ? row.code : undefined, name, address: typeof row?.address === "string" ? row.address : undefined }];
    })
  };
}

export async function findMjErpCustomer(name: string): Promise<ApiResponse<MjErpCustomer | undefined>> {
  const result = await listMjErpCustomers(name);
  if (!result.success) return result;
  const normalized = name.trim().toLowerCase();
  return { success: true, data: result.data.find((item) => item.name.trim().toLowerCase() === normalized || item.code?.trim().toLowerCase() === normalized) };
}

export async function createMjErpCustomer(input: { externalId: string; name: string; address: string }): Promise<ApiResponse<MjErpCustomer>> {
  const code = `MJ-${input.externalId}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 50);
  const response = await anikaRequest<unknown>("/customers", {
    method: "POST",
    body: JSON.stringify({
      code, name: input.name, address: input.address, telephone: "-", phone: "-",
      email: `customer+${code.toLowerCase()}@mj.integration`, perusahaan: input.name, tipe: "PRI", fax: "-",
      isSpecial: "0", tempo_kredit: 0, kredit_limit: 0, tipe_pembayaran: "Bebas", nik_npwp: "-",
      keterangan: `Auto-created from MJ ${input.externalId}`,
      cabang_id: Number(process.env.ANIKA_ERP_DEFAULT_CABANG_ID || 1)
    })
  });
  if (!response.success) return response;
  const row = record(response.data); const data = record(row?.data);
  const id = numberId(row?.id) || numberId(row?.customer_id) || numberId(data?.id) || numberId(data?.customer_id);
  if (!id) return { success: false, code: "ERP_SCHEMA", message: "AJ tidak mengembalikan ID customer." };
  return { success: true, data: { id, code, name: input.name, address: input.address }, details: response.details };
}

export function deterministicReference(kind: "invoice" | "payment", externalReference: string, suffix = "") {
  const prefix = kind === "invoice" ? "MJ-INVOICE" : "MJ-PAY";
  return `${prefix}-${externalReference}${suffix ? `-${suffix}` : ""}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

export async function createMjErpInvoice(input: MjAjInvoiceInput, customerId: number) {
  const erpReference = deterministicReference("invoice", input.external_reference);
  const dueDate = input.payment.due_date || input.invoice_date;
  const response = await anikaRequest<unknown>("/sales", {
    method: "POST",
    body: JSON.stringify({
      erp_reference: erpReference,
      source: "SLM",
      customer_id: customerId,
      so_number: `MJ-SO-${input.external_reference}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60),
      order_date: input.invoice_date,
      delivery_date: input.invoice_date,
      status: "confirmed",
      shipped_to: input.customer.mode === "manual" ? `${input.customer.name} - ${input.customer.address}` : undefined,
      tipe_pengiriman: "Kirim Langsung",
      tempo_pembayaran: Math.max(0, Math.ceil((new Date(dueDate).getTime() - new Date(input.invoice_date).getTime()) / 86_400_000)),
      cabang_id: Number(process.env.ANIKA_ERP_DEFAULT_CABANG_ID || 1),
      auto_create_invoice: true,
      invoice: { invoice_number: input.invoice_reference, invoice_date: input.invoice_date, due_date: dueDate, status: "sent", tax: 0, ppn_rate: 0, other_fee: [] },
      items: input.items.map((item) => ({ product_id: Number(item.external_product_id), quantity: item.quantity, unit_price: item.unit_price, discount: item.discount, tax: 0, tipe_pajak: "Non Pajak" }))
    })
  });
  if (!response.success) return response;
  return { success: true as const, data: { erpReference: erpReferenceFrom(response.data) || erpReference, ...erpInvoiceIdentityFrom(response.data), raw: response.data }, details: response.details };
}

export async function releaseMjStock(input: MjAjInvoiceInput, saleId: string, erpReference: string) {
  return releaseSaleStock({
    saleId, saleDate: input.invoice_date, erpReference, sourceNumber: input.invoice_reference,
    items: input.items.map((item) => ({ productRef: item.sku || String(item.external_product_id), productId: String(item.external_product_id), warehouseId: String(item.warehouse_id), rackId: item.rack_id ? String(item.rack_id) : undefined, quantity: item.quantity, unitPrice: item.unit_price, discount: item.discount }))
  });
}

export async function createMjPayment(input: { reference: string; invoiceId: number; customerId: number; invoiceNumber?: string; paymentDate: string; coaReference: string; method: string; amount: number; notes?: string }) {
  return createErpSalesPayment({ erpReference: input.reference, invoiceId: input.invoiceId, customerId: input.customerId, paymentDate: input.paymentDate, paymentAccountCode: input.coaReference, paymentMethod: input.method, amount: input.amount, notes: input.notes });
}
