import "server-only";
import { anikaRequest } from "./anikaClient";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { Sale } from "@/lib/types/sales";
import { recordAudit } from "@/lib/audit/store";
import { createTempoReceivable, createTempoReceivableInTransaction, syncInitialTempoPaymentForSale } from "@/lib/tempo/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe, resolveSalesRekening } from "@/lib/business/masterData";
import { allocateTransactionIdentity, saveSalesRecord } from "@/lib/sales/store";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { erpSalesTypeCodes as configuredErpSalesTypeCodes, salesTargetForTypeCode } from "@/lib/api/transactionRouting";
import { isErpTransactionSyncEnabled } from "@/lib/settings/erpSync";
import type { Role } from "@/lib/auth/roles";
import { createOfficialProduct, findProductIdBySku, listProducts } from "@/lib/api/products";
import { listErpPaginated } from "@/lib/api/pagination";
import type { ManualSalesProduct } from "@/lib/types/sales";
import { releaseSaleStock, stockReleaseErrorFrom } from "@/lib/api/stockReleases";
import { syncErpSalesPayment } from "@/lib/api/salesPayments";
import { jakartaTimestampFromLocal, transactionDateKey } from "@/lib/date/jakarta";

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function erpSalesTypeCodes(env: NodeJS.ProcessEnv = process.env) {
  return configuredErpSalesTypeCodes(env);
}

export function salesTargetForType(code: string, env: NodeJS.ProcessEnv = process.env): "erp" | "local" {
  return salesTargetForTypeCode(code, env);
}

export function erpReferenceFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const nested = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  const invoice = row.invoice && typeof row.invoice === "object" ? row.invoice as Record<string, unknown> : undefined;
  const nestedInvoice = nested?.invoice && typeof nested.invoice === "object" ? nested.invoice as Record<string, unknown> : undefined;
  const invoiceIdReference = [row.invoice_id, nested?.invoice_id].find((item) =>
    typeof item === "string" && item.trim() && !/^\d+$/.test(item.trim())
  );
  const reference =
    row.erp_reference ??
    nested?.erp_reference ??
    row.invoice_number ??
    invoice?.invoice_number ??
    nested?.invoice_number ??
    nestedInvoice?.invoice_number ??
    invoiceIdReference ??
    row.slm_invoice_number ??
    nested?.slm_invoice_number ??
    row.reference ??
    nested?.reference ??
    row.invoice_id ??
    nested?.invoice_id ??
    row.id ??
    nested?.id;
  return reference === undefined || reference === null ? undefined : String(reference);
}

export function erpInvoiceIdentityFrom(value: unknown): { invoiceId?: number; invoiceNumber?: string } {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const nested = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  const invoice = row.invoice && typeof row.invoice === "object" ? row.invoice as Record<string, unknown> : undefined;
  const nestedInvoice = nested?.invoice && typeof nested.invoice === "object" ? nested.invoice as Record<string, unknown> : undefined;
  const invoiceList = Array.isArray(row.invoices) ? row.invoices : Array.isArray(nested?.invoices) ? nested.invoices : [];
  const firstInvoice = invoiceList[0] && typeof invoiceList[0] === "object" ? invoiceList[0] as Record<string, unknown> : undefined;
  const idValue = row.invoice_id ?? invoice?.id ?? nested?.invoice_id ?? nestedInvoice?.id ?? firstInvoice?.id;
  const parsedId = typeof idValue === "number" ? idValue : typeof idValue === "string" && /^\d+$/.test(idValue.trim()) ? Number(idValue) : undefined;
  const numberValue = row.invoice_number ?? invoice?.invoice_number ?? nested?.invoice_number ?? nestedInvoice?.invoice_number ?? firstInvoice?.invoice_number ?? row.slm_invoice_number ?? nested?.slm_invoice_number;
  return {
    invoiceId: parsedId && parsedId > 0 ? parsedId : undefined,
    invoiceNumber: typeof numberValue === "string" && numberValue.trim() ? numberValue.trim() : undefined
  };
}

export function safeErpSyncError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const code = response.code || "ERP_ERROR";
  const message = String(response.message || "");
  const lowerMessage = message.toLowerCase();
  if (code === "ERP_AUTH") return "ERP menolak akses. Silakan cek sesi atau token ERP.";
  if (code === "ERP_SESSION_REQUIRED") return "Sesi ERP tidak tersedia. Silakan masuk kembali.";
  if (code === "ERP_TIMEOUT") return "ERP timeout saat sinkronisasi.";
  if (code === "ERP_NOT_CONFIGURED") return "Konfigurasi ERP belum lengkap.";
  if (code === "ERP_NETWORK") return "Koneksi ERP bermasalah.";
  if (code === "ERP_CUSTOMER_NOT_LINKED") return response.message || "Customer ERP belum terhubung.";
  if (code === "ERP_CUSTOMER_AUTO_CREATE_FAILED") return response.message || "Customer ERP gagal dibuat otomatis.";
  if (code === "ERP_PRODUCT_NOT_FOUND") return response.message || "Produk ERP tidak ditemukan.";
  if (code === "ERP_PRODUCT_REFERENCE_MISSING") return response.message || "Referensi produk ERP belum lengkap.";
  if (code === "ERP_PRODUCT_CREATE_FAILED") return response.message || "Produk ERP gagal dibuat.";
  if (code === "ERP_PAYLOAD_INCOMPLETE") return response.message || "Payload transaksi ERP belum lengkap.";
  if (code === "ERP_VALIDATION") return response.message || "ERP menolak payload/data transaksi.";
  if (code === "ERP_NOT_FOUND") return response.message || "Endpoint/resource ERP tidak ditemukan.";
  if (lowerMessage.includes("hpp") || lowerMessage.includes("coa") || lowerMessage.includes("release barang")) {
    return "ERP menolak invoice: HPP/COA produk belum valid.";
  }
  return response.message || "ERP gagal memproses transaksi.";
}

type ErpCustomer = { id?: unknown; code?: unknown; name?: unknown; perusahaan?: unknown };
type ErpSaleSyncItem = { productRef: string; productId?: string; productInputMode?: "erp" | "manual"; manualProduct?: ManualSalesProduct; warehouseId?: string; warehouseNameSnapshot?: string; rackId?: string; rackNameSnapshot?: string; unitSnapshot?: string; uomIdSnapshot?: number; quantity: number; unitPrice: number; discount?: number };
type ErpSaleSyncInput = {
  saleDate: string;
  customerName: string;
  customerLocation?: string;
  paymentMethod: PenjualanInput["paymentMethod"];
  dueDate?: string;
  deliveryAt?: string;
  deliveryDate?: string;
  shippingMethod?: string;
  notes?: string;
  items: ErpSaleSyncItem[];
};

function erpDeliveryDate(input: Pick<ErpSaleSyncInput, "saleDate" | "deliveryAt" | "deliveryDate">) {
  if (input.deliveryAt) return transactionDateKey(jakartaTimestampFromLocal(input.deliveryAt));
  return input.deliveryDate || input.saleDate;
}

type ErpSalesPayload = {
  erp_reference: string;
  source: "SLM";
  customer_id: number;
  so_number: string;
  order_date: string;
  delivery_date: string;
  status: string;
  shipped_to?: string;
  tipe_pengiriman: string;
  tempo_pembayaran: number;
  cabang_id: number;
  auto_create_invoice: boolean;
  invoice: {
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    status: string;
    tax: number;
    ppn_rate: number;
    other_fee: Array<{ label: string; amount: number }>;
  };
  items: Array<{ product_id: number; quantity: number; unit_price: number; discount?: number; tax: number; tipe_pajak: string }>;
};

function normalizeLookup(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanCustomerLookupName(value: string) {
  return value.replace(/^\[TEST [^\]]+\]\s*/i, "").trim();
}

function numberId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function customerName(row: ErpCustomer) {
  return typeof row.name === "string" ? row.name : "";
}

function customerCode(row: ErpCustomer) {
  return typeof row.code === "string" ? row.code : "";
}

function autoCreateCustomerEnabled(env: NodeJS.ProcessEnv = process.env) {
  return String(env.ANIKA_ERP_AUTO_CREATE_CUSTOMER ?? "false").trim().toLowerCase() === "true";
}

function autoCustomerEmailDomain(env: NodeJS.ProcessEnv = process.env) {
  return String(env.ANIKA_ERP_AUTO_CUSTOMER_EMAIL_DOMAIN ?? "slm.localhost.test")
    .trim()
    .replace(/^@+/, "") || "slm.localhost.test";
}

function defaultErpCabangId(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(String(env.ANIKA_ERP_DEFAULT_CABANG_ID ?? "1").trim());
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function walkInCustomerId(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(String(env.ANIKA_ERP_WALK_IN_CUSTOMER_ID ?? "").trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function walkInCustomerCode(env: NodeJS.ProcessEnv = process.env) {
  return String(env.ANIKA_ERP_WALK_IN_CUSTOMER_CODE ?? "WALK-IN").trim();
}

function defaultErpBrandCode(env: NodeJS.ProcessEnv = process.env) {
  return String(env.ANIKA_ERP_DEFAULT_KODE_MERK ?? "UMUM").trim() || "UMUM";
}

function defaultProductCostPrice(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(String(env.ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function isImmediateErpPayment(method: string) {
  return method === "Cash" || method === "TF";
}

function safeErpPaymentError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  if (response.code === "ERP_PAYMENT_COA_MISSING") return response.message;
  if (response.code === "ERP_PAYMENT_INVOICE_MISSING") return response.message;
  if (response.code === "ERP_PAYMENT_CUSTOMER_MISSING") return response.message;
  if (response.code === "ERP_PAYMENT_AMOUNT_INVALID") return response.message;
  return response.message || "Payment ERP gagal dibuat.";
}

export function erpHttpStatus(response: ApiResponse<unknown>) {
  const details = response.details && typeof response.details === "object" ? response.details as Record<string, unknown> : {};
  const status = details.status;
  return typeof status === "number" ? status : undefined;
}

export function erpAuditResponse(response: ApiResponse<unknown>) {
  const details = response.details && typeof response.details === "object" ? response.details as Record<string, unknown> : {};
  if ("body" in details) return details.body;
  if (response.success) return response.data;
  return { code: response.code, upstreamCode: details.upstreamCode, correlationId: details.correlationId, status: details.status };
}

function normalizeManualSaleItems(items: ErpSaleSyncItem[]): ErpSaleSyncItem[] {
  const defaultCost = defaultProductCostPrice();
  return items.map((item) => {
    if (item.productInputMode !== "manual" || !item.manualProduct) return item;
    const manual = item.manualProduct;
    const effectiveSellPrice = positiveNumber(manual.sellingPrice) ?? positiveNumber(item.unitPrice) ?? manual.sellingPrice;
    const effectiveCostPrice = positiveNumber(manual.costPrice) ?? defaultCost ?? manual.costPrice;
    return {
      ...item,
      productRef: manual.sku?.trim() || item.productRef,
      manualProduct: {
        ...manual,
        sku: manual.sku?.trim() || item.productRef,
        sellingPrice: effectiveSellPrice,
        costPrice: effectiveCostPrice
      }
    };
  });
}

async function resolveOrCreateManualProduct(item: ErpSaleSyncItem): Promise<ApiResponse<ErpSaleSyncItem>> {
  if (item.productInputMode !== "manual") return { success: true, data: item };
  if (numberId(item.productId)) return { success: true, data: item };
  const manual = item.manualProduct;
  const sku = (manual?.sku || item.productRef).trim();
  if (!sku) return failure("Produk manual belum memiliki SKU/kode produk.", "ERP_PRODUCT_REFERENCE_MISSING");
  if (!manual?.name?.trim()) return failure(`Produk manual ${sku} belum memiliki nama produk.`, "ERP_PRODUCT_REFERENCE_MISSING");

  const existing = await findProductIdBySku(sku);
  if (!existing.success) return existing;
  let productId = existing.data;

  if (!productId) {
    if (!manual.productCategoryId || !manual.uomId) return failure(`Produk manual ${sku} belum memiliki kategori atau satuan ERP yang valid.`, "ERP_PRODUCT_REFERENCE_MISSING");
    const effectiveSellPrice = positiveNumber(manual.sellingPrice) ?? positiveNumber(item.unitPrice);
    if (!effectiveSellPrice) return failure(`Produk manual ${sku} belum memiliki harga jual ERP yang valid.`, "ERP_PRODUCT_REFERENCE_MISSING");
    const effectiveCostPrice = positiveNumber(manual.costPrice) ?? defaultProductCostPrice();
    if (!effectiveCostPrice) return failure(`Harga modal produk ${sku} wajib diisi agar HPP ERP bisa dihitung. Isi harga modal atau ANIKA_ERP_DEFAULT_PRODUCT_COST_PRICE.`, "ERP_PRODUCT_REFERENCE_MISSING");
    const created = await createOfficialProduct({
      sku,
      name: manual.name,
      productCategoryId: manual.productCategoryId,
      uomId: manual.uomId,
      brandCode: manual.brandCode?.trim() || defaultErpBrandCode(),
      sellPrice: effectiveSellPrice,
      costPrice: effectiveCostPrice,
      description: manual.description
    });
    if (!created.success) return failure(`Produk manual ${sku} gagal dibuat di ERP: ${created.message}`, created.code || "ERP_PRODUCT_CREATE_FAILED", created.details);
    productId = created.data;
  }

  const normalizedManual = normalizeManualSaleItems([item])[0].manualProduct;
  return {
    success: true,
    data: {
      ...item,
      productRef: sku,
      productId: String(productId),
      manualProduct: normalizedManual
    }
  };
}

async function resolveManualProductsForSaleItems(items: ErpSaleSyncItem[]): Promise<ApiResponse<ErpSaleSyncItem[]>> {
  const normalized = normalizeManualSaleItems(items);
  const resolved: ErpSaleSyncItem[] = [];
  for (const item of normalized) {
    const result = await resolveOrCreateManualProduct(item);
    if (!result.success) return result;
    resolved.push(result.data);
  }
  return { success: true, data: resolved };
}

function generatedErpDocumentNumber(prefix: string) {
  return `SLM-${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`.slice(0, 60);
}

function generatedSalesErpReference() {
  return generatedErpDocumentNumber("SALE");
}

function erpShippingType(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "ambil sendiri") return "Ambil Sendiri";
  if (normalized === "kirim langsung") return "Kirim Langsung";
  return "Kirim Langsung";
}

function safeCreateCustomerErrorMessage(message?: string) {
  if (!message) return "Customer ERP gagal dibuat otomatis.";
  if (/isSpecial/i.test(message)) return "ERP menolak create customer: isSpecial wajib diisi.";
  if (/cabang/i.test(message)) return "ERP menolak create customer: cabang wajib valid.";
  if (/tipe_pembayaran/i.test(message)) return "ERP menolak create customer: tipe pembayaran wajib valid.";
  return message;
}

function slugCustomerCode(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "CUSTOMER";
}

function generatedCustomerCode(name: string) {
  const suffix = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase();
  return `SLM-${slugCustomerCode(name)}-${suffix}`.slice(0, 50);
}

function responseId(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : undefined;
  const nested = row?.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  return numberId(row?.id) ?? numberId(row?.customer_id) ?? numberId(nested?.id) ?? numberId(nested?.customer_id);
}

async function findCustomerByNameOrCode(lookupName: string): Promise<ApiResponse<number | undefined>> {
  const response = await listErpPaginated("/customers", { maxPages: 3, query: { name: lookupName } });
  if (!response.success) return response;
  const rows = response.data as ErpCustomer[];
  const normalized = normalizeLookup(lookupName);
  const match = rows.find((row) => normalizeLookup(customerName(row)) === normalized || normalizeLookup(customerCode(row)) === normalized);
  return { success: true, data: numberId(match?.id) };
}

async function findCustomerByCode(code: string): Promise<ApiResponse<number | undefined>> {
  const response = await listErpPaginated("/customers", { maxPages: 1, query: { code } });
  if (!response.success) return response;
  const rows = response.data as ErpCustomer[];
  const normalized = normalizeLookup(code);
  const match = rows.find((row) => normalizeLookup(customerCode(row)) === normalized);
  return { success: true, data: numberId(match?.id) };
}

export async function resolveWalkInCustomerId(): Promise<ApiResponse<number>> {
  const configuredId = walkInCustomerId();
  if (configuredId) return { success: true, data: configuredId };
  const code = walkInCustomerCode();
  if (!code) return failure("Customer Walk In ERP belum dikonfigurasi. Isi ANIKA_ERP_WALK_IN_CUSTOMER_ID atau ANIKA_ERP_WALK_IN_CUSTOMER_CODE.", "ERP_WALK_IN_CUSTOMER_NOT_CONFIGURED");
  const response = await findCustomerByCode(code);
  if (!response.success) return response;
  if (response.data) return { success: true, data: response.data };
  return failure(`Customer Walk In ERP dengan kode ${code} tidak ditemukan. Buat customer tersebut di ERP atau isi ANIKA_ERP_WALK_IN_CUSTOMER_ID.`, "ERP_WALK_IN_CUSTOMER_NOT_FOUND");
}

async function createErpCustomer(input: { name: string; location?: string }): Promise<ApiResponse<number>> {
  const name = cleanCustomerLookupName(input.name);
  if (!name || normalizeLookup(name) === "walk in") {
    return failure("Customer manual belum cukup jelas untuk dibuat di ERP.", "ERP_CUSTOMER_AUTO_CREATE_SKIPPED");
  }

  const code = generatedCustomerCode(name);
  const placeholder = "-";
  const response = await anikaRequest<unknown>("/customers", {
    method: "POST",
    body: JSON.stringify({
      code,
      name,
      address: input.location || placeholder,
      telephone: placeholder,
      phone: placeholder,
      email: `customer+${code.toLowerCase()}@${autoCustomerEmailDomain()}`,
      perusahaan: name,
      tipe: "PRI",
      fax: placeholder,
      isSpecial: "0",
      tempo_kredit: 0,
      kredit_limit: 0,
      tipe_pembayaran: "Bebas",
      nik_npwp: placeholder,
      keterangan: "Auto-created from SLM transaction",
      cabang_id: defaultErpCabangId()
    })
  });
  if (!response.success) {
    return failure(safeCreateCustomerErrorMessage(response.message), "ERP_CUSTOMER_AUTO_CREATE_FAILED", response.details);
  }
  const id = responseId(response.data);
  if (!id) return failure("Customer ERP berhasil dibuat tetapi ID customer tidak terbaca.", "ERP_SCHEMA");
  await recordAudit({
    entityType: "erp_sync",
    entityId: code,
    action: "create",
    afterValue: { customerCode: code, customerName: name, source: "sales_customer_auto_create" },
    reason: "Customer ERP dibuat otomatis dari transaksi SLM"
  });
  return { success: true, data: id };
}

export async function resolveErpCustomerId(customerNameInput: string, customerLocation?: string): Promise<ApiResponse<number>> {
  const lookupName = cleanCustomerLookupName(customerNameInput);
  if (!lookupName) return failure("Customer ERP belum terhubung: nama customer kosong.", "ERP_CUSTOMER_NOT_LINKED");
  if (normalizeLookup(lookupName) === "walk in") return resolveWalkInCustomerId();
  const direct = await findCustomerByNameOrCode(lookupName);
  if (!direct.success) return direct;
  if (direct.data) return { success: true, data: direct.data };

  const byCode = await findCustomerByCode(lookupName);
  if (!byCode.success) return byCode;
  if (byCode.data) return { success: true, data: byCode.data };

  if (autoCreateCustomerEnabled()) {
    const created = await createErpCustomer({ name: lookupName, location: customerLocation });
    if (created.success) return created;
    return created;
  }

  return failure("Customer ERP tidak ditemukan dan auto-create customer tidak aktif.", "ERP_CUSTOMER_NOT_LINKED");
}

async function resolveErpSaleItems(items: ErpSaleSyncItem[]): Promise<ApiResponse<Array<{ product_id: number; quantity: number; unit_price: number; discount?: number }>>> {
  const prepared = await resolveManualProductsForSaleItems(items);
  if (!prepared.success) return prepared;
  const resolved: Array<{ product_id: number; quantity: number; unit_price: number; discount?: number }> = [];
  const preparedItems = prepared.data;
  const missing = preparedItems.filter((item) => !numberId(item.productId) && item.productInputMode !== "manual");
  const products = missing.length > 0 ? await listProducts() : undefined;
  if (products && !products.success) return products;

  for (const item of preparedItems) {
    let productId = numberId(item.productId)
      ?? numberId(products?.data.find((product) => normalizeLookup(product.code) === normalizeLookup(item.productRef) || normalizeLookup(product.id) === normalizeLookup(item.productRef))?.productId)
      ?? numberId(products?.data.find((product) => normalizeLookup(product.code) === normalizeLookup(item.productRef) || normalizeLookup(product.id) === normalizeLookup(item.productRef))?.id);

    if (!productId) return failure(`Produk ERP tidak ditemukan: ${item.productRef}. Pilih ulang barang dari dropdown ERP atau gunakan Barang baru/manual.`, "ERP_PRODUCT_NOT_FOUND");
    resolved.push({ product_id: productId, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount || 0 });
  }

  return { success: true, data: resolved };
}

async function buildOfficialSalesPayload(input: ErpSaleSyncInput, erpReference = generatedSalesErpReference()): Promise<ApiResponse<{ payload: ErpSalesPayload; invoiceNumber: string }>> {
  const customer = await resolveErpCustomerId(input.customerName, input.customerLocation);
  if (!customer.success) return customer;
  const items = await resolveErpSaleItems(normalizeManualSaleItems(input.items));
  if (!items.success) return items;
  if (items.data.length === 0) return failure("Payload transaksi ERP belum lengkap: item kosong.", "ERP_PAYLOAD_INCOMPLETE");

  const manualCustomer = cleanCustomerLookupName(input.customerName);
  const shippedTo = [manualCustomer, input.customerLocation].filter(Boolean).join(" - ") || undefined;
  const saleDate = input.saleDate;
  const dueDate = input.paymentMethod === "Tempo" && input.dueDate ? input.dueDate : saleDate;
  const cabangId = defaultErpCabangId();
  const invoiceNumber = generatedErpDocumentNumber("INV");
  const payload: ErpSalesPayload = {
    erp_reference: erpReference,
    source: "SLM",
    customer_id: customer.data,
    so_number: generatedErpDocumentNumber("SO"),
    order_date: saleDate,
    delivery_date: erpDeliveryDate(input),
    status: "confirmed",
    shipped_to: shippedTo,
    tipe_pengiriman: erpShippingType(input.shippingMethod),
    tempo_pembayaran: input.paymentMethod === "Tempo" && input.dueDate ? Math.max(0, Math.ceil((new Date(input.dueDate).getTime() - new Date(input.saleDate).getTime()) / 86_400_000)) : 0,
    cabang_id: cabangId,
    auto_create_invoice: true,
    invoice: {
      invoice_number: invoiceNumber,
      invoice_date: saleDate,
      due_date: dueDate,
      status: "sent",
      tax: 0,
      ppn_rate: 0,
      other_fee: []
    },
    items: items.data.map((item) => ({
      ...item,
      tax: 0,
      tipe_pajak: "Non Pajak"
    }))
  };
  return { success: true, data: { payload, invoiceNumber } };
}

function decorateSalesResponse(response: ApiResponse<unknown>, fallbackReference: string, invoiceNumber: string): ApiResponse<unknown> {
  if (!response.success) return response;
  const data = response.data && typeof response.data === "object"
    ? { ...(response.data as Record<string, unknown>), slm_invoice_number: invoiceNumber, erp_reference: fallbackReference }
    : { raw: response.data, slm_invoice_number: invoiceNumber, erp_reference: fallbackReference };
  return { success: true, data, details: response.details };
}

export async function sendOfficialSalesToErp(input: ErpSaleSyncInput): Promise<ApiResponse<unknown>> {
  const built = await buildOfficialSalesPayload(input);
  if (!built.success) return built;

  const response = await anikaRequest<unknown>("/sales", {
    method: "POST",
    body: JSON.stringify(built.data.payload)
  });
  return decorateSalesResponse(response, built.data.payload.erp_reference, built.data.invoiceNumber);
}

export async function updateOfficialSalesInErp(input: ErpSaleSyncInput, erpReference: string): Promise<ApiResponse<unknown>> {
  const cleanReference = erpReference.trim();
  if (!cleanReference) return failure("ERP reference transaksi tidak tersedia untuk update.", "ERP_REFERENCE_MISSING");
  const built = await buildOfficialSalesPayload(input, cleanReference);
  if (!built.success) return built;
  const response = await anikaRequest<unknown>(`/sales/${encodeURIComponent(cleanReference)}`, {
    method: "PUT",
    body: JSON.stringify(built.data.payload)
  });
  if (!response.success && response.code === "ERP_VALIDATION" && (response.details as { status?: number } | undefined)?.status === 422) {
    return failure(
      "ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru.",
      "ERP_SALES_UPDATE_REJECTED",
      response.details
    );
  }
  return decorateSalesResponse(response, cleanReference, built.data.invoiceNumber);
}

export function buildSalesNeoCommand(input: {
  saleDate: string;
  tipeId?: string;
  tipeCodeSnapshot?: string;
  tipeNameSnapshot?: string;
  customerName: string;
  customerLocation?: string;
  paymentMethod: string;
  dueDate?: string;
  rekeningId?: string;
  deliveryAt?: string;
  deliveryDate?: string;
  shippingMethod?: string;
  transferAccount?: string;
  notes?: string;
  items: { productRef: string; productId?: string; quantity: number; unitPrice: number; discount?: number }[];
  testReference?: string;
  isTestTransaction?: boolean;
}) {
  const code = (input.tipeCodeSnapshot || "AJ").toUpperCase();
  return {
    text: `${input.testReference ? `[TEST ${code}] ${input.testReference}. ` : ""}Buat penjualan dan invoice penjualan untuk ${input.customerName} tanggal ${input.saleDate}.`,
    parsedIntent: {
      action: "create_sales",
      customer_name: input.customerName,
      date: input.saleDate,
      tipe_id: input.tipeId,
      tipe_code_snapshot: input.tipeCodeSnapshot,
      tipe_name_snapshot: input.tipeNameSnapshot,
      payment_status: input.paymentMethod,
      due_date: input.dueDate || undefined,
      rekening_id: input.rekeningId || undefined,
      delivery_date: erpDeliveryDate(input),
      delivery_method: input.shippingMethod || undefined,
      auto_create_invoice: true,
      items: input.items.map((item) => ({ product_id: numberId(item.productId), product_ref: item.productRef, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount || 0 })),
      test_reference: input.testReference,
      is_test_transaction: input.isTestTransaction === true,
      message: [`Lokasi customer: ${input.customerLocation}`, `Pembayaran: ${input.paymentMethod}${input.transferAccount ? ` - ${input.transferAccount}` : ""}`, input.notes || ""].filter(Boolean).join(". ")
    }
  };
}

async function persistErpSale(input: {
  sale: Sale;
  total: number;
  approvalStatus: NonNullable<Sale["approvalStatus"]>;
  paymentMethod: PenjualanInput["paymentMethod"];
  dueDate?: string;
  tipe: { id: string; code: string; name: string };
  user: { id: string; name: string; role: Role };
  auditReason: string;
}) {
  const { sale, total, approvalStatus, paymentMethod, dueDate, tipe, user, auditReason } = input;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const identity = sale.transactionNumber || !sale.transactionAt ? {} : await allocateTransactionIdentity(tx, sale.transactionAt);
    Object.assign(sale, identity);
    await tx.salesRecord.create({
      data: {
        id: sale.id,
        saleDate: new Date(sale.saleDate),
        transactionNumber: sale.transactionNumber,
        transactionAt: sale.transactionAt ? new Date(sale.transactionAt) : undefined,
        transactionSequence: sale.transactionSequence,
        transactionDateKey: sale.transactionDateKey,
        deliveryAt: sale.deliveryAt ? new Date(sale.deliveryAt) : undefined,
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: sale.customerName,
        customerLocation: sale.customerLocation,
        shippingMethod: sale.shippingMethod,
        paymentMethod: sale.paymentMethod,
        dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
        initialPaymentAmount: sale.initialPaymentAmount || 0,
        initialPaymentMethod: sale.initialPaymentMethod,
        initialPaymentRekeningId: sale.initialPaymentRekeningId,
        initialPaymentRekeningNameSnapshot: sale.initialPaymentRekeningNameSnapshot,
        initialPaymentNotes: sale.initialPaymentNotes,
        rekeningId: sale.rekeningId,
        rekeningNameSnapshot: sale.rekeningNameSnapshot,
        transferAccount: sale.transferAccount,
        notes: sale.notes,
        total,
        approvalStatus,
        syncTarget: sale.syncTarget || "erp",
        syncStatus: sale.syncStatus || "failed",
        syncError: sale.syncError,
        syncAttemptedAt: sale.syncAttemptedAt ? new Date(sale.syncAttemptedAt) : undefined,
        syncedAt: sale.syncedAt ? new Date(sale.syncedAt) : undefined,
        erpReference: sale.erpReference,
        erpInvoiceId: sale.erpInvoiceId,
        erpInvoiceNumber: sale.erpInvoiceNumber,
        erpSyncHttpStatus: sale.erpSyncHttpStatus,
        erpSyncResponse: sale.erpSyncResponse === undefined ? undefined : serializeJson(sale.erpSyncResponse),
        stockReleaseStatus: sale.stockReleaseStatus || "not_required",
        stockReleaseError: sale.stockReleaseError,
        stockReleaseReference: sale.stockReleaseReference,
        stockReleasedAt: sale.stockReleasedAt ? new Date(sale.stockReleasedAt) : undefined,
        stockReleaseHttpStatus: sale.stockReleaseHttpStatus,
        stockReleaseResponse: sale.stockReleaseResponse === undefined ? undefined : serializeJson(sale.stockReleaseResponse),
        erpPaymentStatus: sale.erpPaymentStatus || "not_required",
        erpPaymentError: sale.erpPaymentError,
        erpPaymentReference: sale.erpPaymentReference,
        erpPaymentSyncedAt: sale.erpPaymentSyncedAt ? new Date(sale.erpPaymentSyncedAt) : undefined,
        erpPaymentAttemptedAt: sale.erpPaymentAttemptedAt ? new Date(sale.erpPaymentAttemptedAt) : undefined,
        testReference: sale.testReference,
        isTestTransaction: sale.isTestTransaction || false,
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdByRoleSnapshot: user.role,
        createdAt: new Date(sale.createdAt || Date.now()),
        items: {
          create: sale.items.map((item, index) => ({
            id: `${sale.id}-item-${index}`,
            productRef: item.productRef,
            productId: item.productId,
            manualProduct: item.manualProduct ? serializeJson(item.manualProduct) : undefined,
            warehouseId: item.warehouseId,
            warehouseNameSnapshot: item.warehouseNameSnapshot,
            rackId: item.rackId,
            rackNameSnapshot: item.rackNameSnapshot,
            unitSnapshot: item.unitSnapshot,
            uomIdSnapshot: item.uomIdSnapshot,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            sortOrder: index
          }))
        }
      }
    });
    if (approvalStatus === "pending_approval") {
      const approval = {
        id: `APR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        module: "penjualan",
        entityId: sale.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        amount: total,
        status: "pending_approval",
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdByRoleSnapshot: user.role,
        createdAt: new Date()
      } as const;
      await tx.approvalRequest.create({ data: approval });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "approval",
          entityId: approval.id,
          action: "create",
          afterValue: serializeJson({ ...approval, createdAt: approval.createdAt.toISOString() }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: "penjualan pending_approval"
        }
      });
    }
    if (approvalStatus === "approved" && paymentMethod === "Tempo") {
      await createTempoReceivableInTransaction(tx, {
        salesId: sale.id, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name,
        customerName: sale.customerName, originalAmount: total, transactionDate: sale.saleDate,
        dueDate: dueDate || sale.saleDate,
        initialPayment: { amount: sale.initialPaymentAmount || 0, method: sale.initialPaymentMethod, rekeningId: sale.initialPaymentRekeningId, rekeningNameSnapshot: sale.initialPaymentRekeningNameSnapshot, notes: sale.initialPaymentNotes }
      }, user);
    }
    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "sales",
        entityId: sale.id,
        action: "create",
        afterValue: serializeJson(sale),
        userId: user.id,
        userNameSnapshot: user.name,
        userRoleSnapshot: user.role,
        reason: auditReason
      }
    });
  });
}

export async function createSale(input: PenjualanInput): Promise<ApiResponse<unknown>> {
  const total = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  const rekening = await resolveSalesRekening(input.paymentMethod, tipe.id, input.rekeningId);
  const initialRekening = input.paymentMethod === "Tempo" && input.initialPaymentAmount > 0 && input.initialPaymentMethod
    ? await resolveSalesRekening(input.initialPaymentMethod, tipe.id, input.initialPaymentRekeningId)
    : undefined;
  const approvalStatus: NonNullable<Sale["approvalStatus"]> = "approved";
  const isSyncEnabled = await isErpTransactionSyncEnabled();
  const target = salesTargetForTypeCode(tipe.code, process.env, isSyncEnabled);
  const isTestTransaction = target === "erp" && user.role === "OWNER" && input.isTestTransaction === true;
  const testReference = isTestTransaction ? `TEST-${tipe.code.toUpperCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}` : undefined;
  const customerName = testReference ? `[TEST ${tipe.code.toUpperCase()}] ${input.customerName}` : input.customerName;
  const notes = [input.notes, testReference ? `Transaksi pengujian ${testReference}` : ""].filter(Boolean).join(" • ") || undefined;
  const normalizedItems = normalizeManualSaleItems(input.items);
  const preparedManualItems = await resolveManualProductsForSaleItems(normalizedItems);
  if (!preparedManualItems.success) return preparedManualItems;
  const effectiveItems = preparedManualItems.data;
  const transactionAt = jakartaTimestampFromLocal(input.transactionAt || `${input.saleDate}T00:00`);
  const saleDate = transactionDateKey(transactionAt);
  const deliveryAt = input.deliveryAt ? jakartaTimestampFromLocal(input.deliveryAt) : undefined;
  if (deliveryAt && deliveryAt < transactionAt) return failure("Tanggal dan jam kirim tidak boleh sebelum waktu transaksi", "VALIDATION_ERROR");
  const effectiveInput = { ...input, saleDate, transactionAt, deliveryAt, customerName, notes, isTestTransaction, items: effectiveItems, rekeningId: rekening?.id, rekeningNameSnapshot: rekening?.name, initialPaymentRekeningId: initialRekening?.id, initialPaymentRekeningNameSnapshot: initialRekening?.name };

  const saleId = `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const erpReference = `SLM-${saleId}`;

  // Eksekusi pelepasan/pengurangan stok fisik ke Aneka Jaya (AJ)
  const stockResponse = await releaseSaleStock({
    saleId,
    saleDate,
    erpReference,
    sourceNumber: erpReference,
    items: effectiveInput.items
  });

  if (!stockResponse.success) {
    return failure(
      stockResponse.message || "Pengurangan stok di Aneka Jaya gagal.",
      stockResponse.code || "ERP_STOCK_RELEASE_FAILED",
      stockResponse.details
    );
  }

  const stockReleasedAt = new Date().toISOString();
  const stockReleaseStatus: Sale["stockReleaseStatus"] = stockResponse.data.status === "already_released" ? "already_released" : "released";
  const stockReleaseReference = stockResponse.data.releaseReference;

  const sale: Sale = {
    id: saleId,
    ...effectiveInput,
    tipeId: tipe.id,
    tipeCodeSnapshot: tipe.code,
    tipeNameSnapshot: tipe.name,
    total,
    approvalStatus,
    syncTarget: "local",
    syncStatus: "local",
    stockReleaseStatus,
    stockReleaseReference,
    stockReleasedAt,
    erpPaymentStatus: "not_required",
    testReference,
    isTestTransaction,
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdByRoleSnapshot: user.role,
    createdAt: new Date().toISOString()
  };

  const tempoInput = approvalStatus === "approved" && input.paymentMethod === "Tempo"
    ? {
        salesId: sale.id,
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: input.customerName,
        originalAmount: total,
        transactionDate: saleDate,
        dueDate: input.dueDate || saleDate,
        initialPayment: {
          amount: input.initialPaymentAmount,
          method: input.initialPaymentMethod,
          rekeningId: initialRekening?.id,
          rekeningNameSnapshot: initialRekening?.name,
          notes: input.initialPaymentNotes
        }
      }
    : undefined;

  if (tempoInput) await saveSalesRecord(sale, { tempo: tempoInput });
  else await saveSalesRecord(sale);
  if (process.env.NEXT_PUBLIC_APP_MODE !== "production" && tempoInput) await createTempoReceivable(tempoInput);
  if (approvalStatus === "approved" && input.paymentMethod === "Tempo" && input.initialPaymentAmount > 0) {
    await syncInitialTempoPaymentForSale(sale.id);
  }
  await recordAudit({
    entityType: "sales",
    entityId: sale.id,
    action: "create",
    afterValue: sale,
    reason: `Invoice Penjualan SLM • Stok AJ terpotong (${stockReleaseReference}) • ${approvalStatus} • ${input.paymentMethod}`
  });

  return { success: true, data: { ...sale, target: "local" } };
}
