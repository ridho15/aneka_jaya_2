import "server-only";
import { anikaRequest } from "./anikaClient";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import type { Sale } from "@/lib/types/sales";
import { recordAudit } from "@/lib/audit/store";
import { createTempoReceivable } from "@/lib/tempo/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe, resolveSalesRekening } from "@/lib/business/masterData";
import { saveSalesRecord } from "@/lib/sales/store";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { erpTransactionTypeCodes, transactionTargetForType } from "@/lib/api/transactionRouting";
import type { Role } from "@/lib/auth/roles";
import { createOfficialProduct, findProductIdBySku, listProducts } from "@/lib/api/products";
import { listErpPaginated } from "@/lib/api/pagination";
import type { ManualSalesProduct } from "@/lib/types/sales";

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function erpSalesTypeCodes(env: NodeJS.ProcessEnv = process.env) {
  return erpTransactionTypeCodes(env);
}

export function salesTargetForType(code: string, env: NodeJS.ProcessEnv = process.env): "erp" | "local" {
  return transactionTargetForType(code, env);
}

export function erpReferenceFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const nested = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  const reference = row.reference ?? row.id ?? row.invoice_id ?? nested?.reference ?? nested?.id ?? nested?.invoice_id;
  return reference === undefined || reference === null ? undefined : String(reference);
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
type ErpSaleSyncItem = { productRef: string; productId?: string; productInputMode?: "erp" | "manual"; manualProduct?: ManualSalesProduct; unitSnapshot?: string; uomIdSnapshot?: number; quantity: number; unitPrice: number; discount?: number };
type ErpSaleSyncInput = {
  saleDate: string;
  customerName: string;
  customerLocation?: string;
  paymentMethod: PenjualanInput["paymentMethod"];
  dueDate?: string;
  deliveryDate?: string;
  shippingMethod?: string;
  notes?: string;
  items: ErpSaleSyncItem[];
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

async function resolveErpCustomerId(customerNameInput: string, customerLocation?: string): Promise<ApiResponse<number>> {
  const lookupName = cleanCustomerLookupName(customerNameInput);
  if (!lookupName) return failure("Customer ERP belum terhubung: nama customer kosong.", "ERP_CUSTOMER_NOT_LINKED");
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

export async function sendOfficialSalesToErp(input: ErpSaleSyncInput): Promise<ApiResponse<unknown>> {
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
  const payload = {
    customer_id: customer.data,
    so_number: generatedErpDocumentNumber("SO"),
    order_date: saleDate,
    delivery_date: input.deliveryDate || saleDate,
    status: "confirmed",
    shipped_to: shippedTo,
    tipe_pengiriman: erpShippingType(input.shippingMethod),
    tempo_pembayaran: input.paymentMethod === "Tempo" && input.dueDate ? Math.max(0, Math.ceil((new Date(input.dueDate).getTime() - new Date(input.saleDate).getTime()) / 86_400_000)) : 0,
    cabang_id: cabangId,
    auto_create_invoice: true,
    invoice: {
      invoice_number: generatedErpDocumentNumber("INV"),
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

  return anikaRequest("/sales", {
    method: "POST",
    body: JSON.stringify(payload)
  });
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
      delivery_date: input.deliveryDate || undefined,
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
    await tx.salesRecord.create({
      data: {
        id: sale.id,
        saleDate: new Date(sale.saleDate),
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: sale.customerName,
        customerLocation: sale.customerLocation,
        shippingMethod: sale.shippingMethod,
        paymentMethod: sale.paymentMethod,
        dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
        rekeningId: sale.rekeningId,
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
      const now = new Date();
      await tx.tempoReceivable.create({
        data: {
          id: `TMP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          salesId: sale.id,
          tipeId: tipe.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          customerName: sale.customerName,
          originalAmount: total,
          paidAmount: 0,
          remainingAmount: total,
          transactionDate: new Date(sale.saleDate),
          dueDate: new Date(dueDate || sale.saleDate),
          status: "open",
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdAt: now,
          updatedAt: now
        }
      });
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
  const approvalStatus: NonNullable<Sale["approvalStatus"]> = "approved";
  const target = salesTargetForType(tipe.code);
  const isTestTransaction = target === "erp" && user.role === "OWNER" && input.isTestTransaction === true;
  const testReference = isTestTransaction ? `TEST-${tipe.code.toUpperCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}` : undefined;
  const customerName = testReference ? `[TEST ${tipe.code.toUpperCase()}] ${input.customerName}` : input.customerName;
  const notes = [input.notes, testReference ? `Transaksi pengujian ${testReference}` : ""].filter(Boolean).join(" • ") || undefined;
  const normalizedItems = normalizeManualSaleItems(input.items);
  const preparedManualItems = await resolveManualProductsForSaleItems(normalizedItems);
  const effectiveItems = preparedManualItems.success ? preparedManualItems.data : normalizedItems;
  const effectiveInput = { ...input, customerName, notes, isTestTransaction, items: effectiveItems, rekeningId: rekening?.id, rekeningNameSnapshot: rekening?.name };

  if (!preparedManualItems.success) {
    if (target === "local") return preparedManualItems;
    const attemptedAt = new Date().toISOString();
    const syncError = safeErpSyncError(preparedManualItems);
    const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "erp", syncStatus: "failed", syncError, syncAttemptedAt: attemptedAt, testReference, isTestTransaction, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await persistErpSale({ sale, total, approvalStatus, paymentMethod: input.paymentMethod, dueDate: input.dueDate, tipe, user: { id: user.id, name: user.name, role: user.role }, auditReason: `Invoice Penjualan ${tipe.code} • Produk manual ERP gagal, tersimpan untuk retry • ${syncError}` });
    return { success: true, data: { ...sale, target: "erp", retryable: true } };
  }

  if (target === "local") {
    const sale: Sale = { id: `S-${Date.now()}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "local", syncStatus: "local", createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await saveSalesRecord(sale);
    if (approvalStatus === "approved" && input.paymentMethod === "Tempo") await createTempoReceivable({ salesId: sale.id, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, customerName: input.customerName, originalAmount: total, transactionDate: input.saleDate, dueDate: input.dueDate || input.saleDate });
    await recordAudit({ entityType: "sales", entityId: sale.id, action: "create", afterValue: sale, reason: `Invoice Penjualan lokal • ${approvalStatus} • ${input.paymentMethod}` });
    return { success: true, data: { ...sale, target: "local" } };
  }
  const response = await sendOfficialSalesToErp({ ...effectiveInput, customerName: input.customerName });
  const attemptedAt = new Date().toISOString();
  if (response.success) {
    const erpReference = erpReferenceFrom(response.data);
    const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "erp", syncStatus: "synced", syncAttemptedAt: attemptedAt, syncedAt: attemptedAt, erpReference, testReference, isTestTransaction, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await persistErpSale({ sale, total, approvalStatus, paymentMethod: input.paymentMethod, dueDate: input.dueDate, tipe, user: { id: user.id, name: user.name, role: user.role }, auditReason: `Invoice Penjualan ${tipe.code} • Terkirim ke ERP • ${input.paymentMethod}${testReference ? ` • ${testReference}` : ""}` });
    return { success: true, data: { ...sale, target: "erp", erpReference, testReference } };
  }
  const syncError = safeErpSyncError(response);
  const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "erp", syncStatus: "failed", syncError, syncAttemptedAt: attemptedAt, testReference, isTestTransaction, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
  await persistErpSale({ sale, total, approvalStatus, paymentMethod: input.paymentMethod, dueDate: input.dueDate, tipe, user: { id: user.id, name: user.name, role: user.role }, auditReason: `Invoice Penjualan ${tipe.code} • ERP gagal, tersimpan untuk retry • ${syncError}` });
  return { success: true, data: { ...sale, target: "erp", retryable: true } };
}
