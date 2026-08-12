import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { immutablePayloadHash } from "./hash";
import { MjIntegrationError } from "./errors";
import type { MjIntegrationPrincipal } from "./auth";
import type { MjAjInvoiceInput, MjInvoiceInput, MjProcessingMode, MjTempoPaymentInput } from "./validation";
import { createMjErpCustomer, createMjErpInvoice, createMjPayment, deterministicReference, releaseMjStock } from "./erp";

const includeInvoice = { items: { orderBy: { sortOrder: "asc" as const } }, integrationAttempts: { orderBy: { startedAt: "asc" as const } } };
type InvoiceRow = Prisma.SalesRecordGetPayload<{ include: typeof includeInvoice }>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function processingMode(row: InvoiceRow): MjProcessingMode {
  const value = row.integrationProcessingMode;
  return value === "aj_already_processed" || value === "record_only" ? value : "slm_process_aj";
}

function accountReference(snapshot: unknown) {
  const row = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  return String(row.aj_coa_reference || row.erpCoaId || row.account_reference || "");
}

async function resolveMasterData(input: MjInvoiceInput) {
  const tipe = await prisma.bookkeepingType.findFirst({ where: { code: { equals: input.bookkeeping_type_code, mode: "insensitive" }, isActive: true } });
  if (!tipe) throw new MjIntegrationError("VALIDATION_FAILED", "Tipe pembukuan tidak aktif atau tidak ditemukan.", 400, { field: "bookkeeping_type_code" });
  const account = input.payment.account;
  if (!account) return { tipe, accountSnapshot: undefined };
  if (account.mode === "manual") {
    return "account_reference" in account
      ? { tipe, accountSnapshot: { mode: "manual", name: account.name, account_reference: account.account_reference } }
      : { tipe, accountSnapshot: { mode: "manual", name: account.name || account.aj_coa_reference, aj_coa_reference: account.aj_coa_reference } };
  }
  const rekening = await prisma.rekeningAccount.findFirst({
    where: { id: account.rekening_id, isActive: true, tipeLinks: { some: { bookkeepingTypeId: tipe.id } } }
  });
  if (!rekening || (input.processing_mode !== "record_only" && !rekening.erpCoaId)) {
    throw new MjIntegrationError("ACCOUNT_INVALID", input.processing_mode === "record_only"
      ? "Rekening SLM tidak aktif atau tidak sesuai tipe pembukuan."
      : "Rekening SLM tidak aktif, tidak sesuai tipe, atau belum memiliki referensi COA AJ.", 400);
  }
  return { tipe, accountSnapshot: {
    mode: "slm", rekening_id: rekening.id, name: rekening.name, account_number: rekening.accountNumber,
    bank_name: rekening.bankName, erpCoaId: rekening.erpCoaId, erpCoaNameSnapshot: rekening.erpCoaNameSnapshot
  } };
}

function initialStageState(input: MjInvoiceInput) {
  if (input.processing_mode === "record_only") return {
    syncTarget: "local", customer: "not_required", invoice: "not_required", stock: "not_required", payment: "not_required"
  };
  if (input.processing_mode === "aj_already_processed") return {
    syncTarget: "erp", customer: "externally_processed", invoice: "externally_processed", stock: "externally_processed",
    payment: input.payment.paid_amount > 0 ? "externally_processed" : "not_required"
  };
  return {
    syncTarget: "erp", customer: input.customer.mode === "existing" ? "synced" : "pending", invoice: "pending", stock: "pending",
    payment: input.payment.paid_amount > 0 ? "pending" : "not_required"
  };
}

function initialTempoPaymentStage(input: MjInvoiceInput) {
  if (input.processing_mode === "slm_process_aj") return "pending";
  if (input.processing_mode === "aj_already_processed") return "externally_processed";
  return "not_required";
}

async function createLocalInvoice(input: MjInvoiceInput, principal: MjIntegrationPrincipal, payloadHash: string) {
  const { tipe, accountSnapshot } = await resolveMasterData(input);
  const stage = initialStageState(input);
  const id = crypto.randomUUID();
  const customerName = input.customer.mode === "manual" ? input.customer.name : input.customer.name || `Customer ${input.customer.customer_id}`;
  const customerLocation = input.customer.mode === "manual" ? input.customer.address : undefined;
  const paidAmount = input.payment.paid_amount;
  const customerExternalId = input.customer.mode === "manual" ? input.customer.external_id : undefined;
  const existingCustomerId = input.customer.mode === "existing" ? Number(input.customer.customer_id) : undefined;
  const erpCustomerId = input.processing_mode === "aj_already_processed"
    ? Number(input.aj_customer_id)
    : input.processing_mode === "slm_process_aj" ? existingCustomerId : undefined;
  const erpInvoiceId = input.processing_mode === "aj_already_processed" && input.aj_invoice_id ? Number(input.aj_invoice_id) : undefined;
  const erpInvoiceNumber = input.processing_mode === "aj_already_processed" ? input.aj_invoice_number : undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.salesRecord.create({ data: {
        id, saleDate: new Date(`${input.invoice_date}T00:00:00.000Z`), transactionNumber: input.invoice_reference,
        transactionAt: new Date(`${input.invoice_date}T00:00:00.000Z`), tipeId: tipe.id, tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name, customerName, customerLocation, paymentMethod: input.payment.method,
        dueDate: input.payment.due_date ? new Date(`${input.payment.due_date}T00:00:00.000Z`) : null,
        initialPaymentAmount: input.payment.method === "Tempo" ? paidAmount : 0,
        initialPaymentMethod: input.payment.method === "Tempo" && paidAmount > 0 ? "Other" : null,
        rekeningId: input.payment.account?.mode === "slm" ? input.payment.account.rekening_id : null,
        rekeningNameSnapshot: accountSnapshot ? String((accountSnapshot as Record<string, unknown>).name || "") : null,
        notes: input.notes, total: input.total, approvalStatus: "approved", syncTarget: stage.syncTarget, syncStatus: stage.invoice,
        stockReleaseStatus: stage.stock, erpPaymentStatus: stage.payment,
        source: "MJ", externalReference: input.external_reference, integrationPayloadHash: payloadHash,
        integrationClientId: principal.clientId, integrationProcessingMode: input.processing_mode,
        externalCustomerId: customerExternalId, erpCustomerId, erpInvoiceId, erpInvoiceNumber,
        customerSyncStatus: stage.customer, accountSnapshot: accountSnapshot ? json(accountSnapshot) : undefined,
        integrationMetadata: json({ payload: input, client_code: principal.clientCode, environment: principal.environment }),
        createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdByRoleSnapshot: "OWNER", createdAt: new Date(),
        items: { create: input.items.map((item, index) => {
          if ("product_reference" in item) return {
            id: crypto.randomUUID(), productRef: item.product_reference, productId: item.external_product_id || null,
            manualProduct: json({ sku: item.product_reference, name: item.product_name }),
            warehouseId: item.warehouse_id || null, warehouseNameSnapshot: item.warehouse_name || null,
            rackId: item.rack_id || null, rackNameSnapshot: item.rack_name || null, unitSnapshot: item.unit || null,
            quantity: item.quantity, unitPrice: item.unit_price, discount: item.discount, sortOrder: index
          };
          return {
            id: crypto.randomUUID(), productRef: item.sku || String(item.external_product_id), productId: String(item.external_product_id),
            warehouseId: String(item.warehouse_id), warehouseNameSnapshot: item.warehouse_name || null,
            rackId: item.rack_id ? String(item.rack_id) : null, rackNameSnapshot: item.rack_name || null,
            quantity: item.quantity, unitPrice: item.unit_price, discount: item.discount, sortOrder: index
          };
        }) }
      } });
      if (input.payment.method === "Tempo") {
        const remaining = input.total - paidAmount;
        const receivableId = crypto.randomUUID();
        await tx.tempoReceivable.create({ data: {
          id: receivableId, salesId: id, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name,
          customerName, originalAmount: input.total, paidAmount, remainingAmount: remaining,
          transactionDate: new Date(`${input.invoice_date}T00:00:00.000Z`), dueDate: new Date(`${input.payment.due_date}T00:00:00.000Z`),
          status: remaining === 0 ? "paid" : paidAmount > 0 ? "partial_paid" : "open",
          createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdAt: new Date(), updatedAt: new Date()
        } });
        if (paidAmount > 0) await tx.tempoPayment.create({ data: {
          id: crypto.randomUUID(), tempoReceivableId: receivableId, paymentDate: new Date(`${input.invoice_date}T00:00:00.000Z`),
          amountPaid: paidAmount, paymentMethod: "Other", rekeningId: input.payment.account?.mode === "slm" ? input.payment.account.rekening_id : "manual",
          rekeningNameSnapshot: accountSnapshot ? String((accountSnapshot as Record<string, unknown>).name || "Manual") : "Manual",
          notes: "Pembayaran awal invoice MJ", erpPaymentStatus: initialTempoPaymentStage(input),
          erpPaymentReference: input.processing_mode === "slm_process_aj" ? deterministicReference("payment", input.external_reference, "INITIAL") : null,
          erpPaymentSyncedAt: input.processing_mode === "slm_process_aj" ? null : new Date(),
          externalPaymentReference: `${input.external_reference}:INITIAL`, createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdAt: new Date()
        } });
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
  const row = await prisma.salesRecord.findUnique({ where: { source_externalReference: { source: "MJ", externalReference: input.external_reference } }, include: includeInvoice });
  if (!row) throw new MjIntegrationError("INTERNAL_ERROR", "Invoice lokal gagal dibuat.", 500);
  return row;
}

async function attempt(row: InvoiceRow, stage: string, action: () => Promise<{ success: boolean; data?: unknown; code?: string; message?: string; details?: unknown }>) {
  const attemptNumber = await prisma.integrationStageAttempt.count({ where: { salesRecordId: row.id, stage } }) + 1;
  const id = crypto.randomUUID();
  await prisma.integrationStageAttempt.create({ data: { id, salesRecordId: row.id, stage, attemptNumber, status: "processing" } });
  const result = await action();
  const details = result.details && typeof result.details === "object" ? result.details as Record<string, unknown> : {};
  await prisma.integrationStageAttempt.update({ where: { id }, data: {
    status: result.success ? "succeeded" : "failed", errorCode: result.success ? null : result.code,
    errorMessage: result.success ? null : result.message, httpStatus: typeof details.status === "number" ? details.status : null,
    response: result.success && result.data !== undefined ? json(result.data) : result.details !== undefined ? json(result.details) : undefined,
    completedAt: new Date()
  } });
  return result;
}

async function upstreamError(result: { code?: string; message?: string; details?: unknown }, row: InvoiceRow): Promise<never> {
  const timeout = result.code === "ERP_TIMEOUT";
  const current = await prisma.salesRecord.findUnique({ where: { id: row.id }, include: includeInvoice });
  throw new MjIntegrationError(timeout ? "AJ_TIMEOUT" : "AJ_UPSTREAM_ERROR", result.message || "AJ gagal memproses invoice.", timeout ? 504 : 502, current ? invoiceSnapshot(current) : invoiceSnapshot(row), true);
}

async function processCustomer(row: InvoiceRow, input: MjAjInvoiceInput) {
  if (row.erpCustomerId && row.customerSyncStatus === "synced") return row;
  const locked = await prisma.salesRecord.updateMany({ where: { id: row.id, customerSyncStatus: { in: ["pending", "failed"] } }, data: { customerSyncStatus: "processing", customerSyncError: null } });
  if (!locked.count) throw new MjIntegrationError("INVOICE_LOCKED", "Invoice sedang diproses oleh request lain.", 409, invoiceSnapshot(row), true);
  const result = await attempt(row, "customer", async () => {
    if (input.customer.mode === "existing") return { success: true, data: { id: Number(input.customer.customer_id) } };
    const mapping = await prisma.integrationCustomerMapping.findUnique({ where: { source_externalCustomerId: { source: "MJ", externalCustomerId: input.customer.external_id } } });
    if (mapping) return { success: true, data: { id: mapping.erpCustomerId, mapped: true } };
    return createMjErpCustomer({ externalId: input.customer.external_id, name: input.customer.name, address: input.customer.address });
  });
  if (!result.success) {
    await prisma.salesRecord.update({ where: { id: row.id }, data: { customerSyncStatus: "failed", customerSyncError: result.message } });
    await upstreamError(result, row);
  }
  const customerId = Number((result.data as { id?: unknown })?.id);
  if (!customerId) throw new MjIntegrationError("CUSTOMER_INVALID", "ID customer AJ tidak valid.", 400);
  if (input.customer.mode === "manual") await prisma.integrationCustomerMapping.upsert({
    where: { source_externalCustomerId: { source: "MJ", externalCustomerId: input.customer.external_id } },
    create: { id: crypto.randomUUID(), source: "MJ", externalCustomerId: input.customer.external_id, erpCustomerId: customerId, customerNameSnapshot: input.customer.name },
    update: { erpCustomerId: customerId, customerNameSnapshot: input.customer.name }
  });
  return prisma.salesRecord.update({ where: { id: row.id }, data: { erpCustomerId: customerId, customerSyncStatus: "synced", customerSyncError: null }, include: includeInvoice });
}

async function processInvoice(row: InvoiceRow, input: MjAjInvoiceInput) {
  if (row.syncStatus === "synced") return row;
  const locked = await prisma.salesRecord.updateMany({ where: { id: row.id, syncStatus: { in: ["pending", "failed"] } }, data: { syncStatus: "processing", syncError: null, syncAttemptedAt: new Date() } });
  if (!locked.count) throw new MjIntegrationError("INVOICE_LOCKED", "Invoice sedang diproses oleh request lain.", 409, invoiceSnapshot(row), true);
  const result = await attempt(row, "invoice", () => createMjErpInvoice(input, row.erpCustomerId!));
  if (!result.success) {
    await prisma.salesRecord.update({ where: { id: row.id }, data: { syncStatus: "failed", syncError: result.message } });
    await upstreamError(result, row);
  }
  const data = result.data as { erpReference: string; invoiceId?: number; invoiceNumber?: string; raw?: unknown };
  return prisma.salesRecord.update({ where: { id: row.id }, data: {
    syncStatus: "synced", syncError: null, syncedAt: new Date(), erpReference: data.erpReference,
    erpInvoiceId: data.invoiceId, erpInvoiceNumber: data.invoiceNumber || input.invoice_reference,
    erpSyncResponse: data.raw !== undefined ? json(data.raw) : undefined
  }, include: includeInvoice });
}

async function processRelease(row: InvoiceRow, input: MjAjInvoiceInput) {
  if (row.stockReleaseStatus === "released") return row;
  const locked = await prisma.salesRecord.updateMany({ where: { id: row.id, stockReleaseStatus: { in: ["pending", "failed"] } }, data: { stockReleaseStatus: "processing", stockReleaseError: null } });
  if (!locked.count) throw new MjIntegrationError("INVOICE_LOCKED", "Release stok sedang diproses oleh request lain.", 409, invoiceSnapshot(row), true);
  const result = await attempt(row, "stock_release", () => releaseMjStock(input, row.id, row.erpReference!));
  if (!result.success) {
    await prisma.salesRecord.update({ where: { id: row.id }, data: { stockReleaseStatus: "failed", stockReleaseError: result.message } });
    await upstreamError(result, row);
  }
  const data = result.data as { releaseReference?: string };
  return prisma.salesRecord.update({ where: { id: row.id }, data: { stockReleaseStatus: "released", stockReleaseError: null, stockReleaseReference: data.releaseReference, stockReleasedAt: new Date() }, include: includeInvoice });
}

async function processInitialPayment(row: InvoiceRow, input: MjAjInvoiceInput) {
  if (input.payment.paid_amount <= 0 || row.erpPaymentStatus === "paid" || row.erpPaymentStatus === "partial") return row;
  const locked = await prisma.salesRecord.updateMany({ where: { id: row.id, erpPaymentStatus: { in: ["pending", "failed"] } }, data: { erpPaymentStatus: "processing", erpPaymentError: null, erpPaymentAttemptedAt: new Date() } });
  if (!locked.count) throw new MjIntegrationError("INVOICE_LOCKED", "Pembayaran sedang diproses oleh request lain.", 409, invoiceSnapshot(row), true);
  const reference = deterministicReference("payment", input.external_reference, "INITIAL");
  const result = await attempt(row, "payment", () => createMjPayment({ reference, invoiceId: row.erpInvoiceId!, customerId: row.erpCustomerId!, invoiceNumber: row.erpInvoiceNumber || undefined, paymentDate: input.invoice_date, coaReference: accountReference(row.accountSnapshot), method: input.payment.method, amount: input.payment.paid_amount, notes: "Pembayaran awal invoice MJ" }));
  if (!result.success) {
    await prisma.salesRecord.update({ where: { id: row.id }, data: { erpPaymentStatus: "failed", erpPaymentError: result.message } });
    await upstreamError(result, row);
  }
  const status = input.payment.paid_amount === input.total ? "paid" : "partial";
  await prisma.tempoPayment.updateMany({ where: { externalPaymentReference: `${input.external_reference}:INITIAL` }, data: { erpPaymentStatus: status, erpPaymentSyncedAt: new Date(), erpPaymentError: null } });
  return prisma.salesRecord.update({ where: { id: row.id }, data: { erpPaymentStatus: status, erpPaymentError: null, erpPaymentReference: reference, erpPaymentSyncedAt: new Date() }, include: includeInvoice });
}

async function normalizeLegacyHash(row: InvoiceRow, input: MjInvoiceInput, hash: string) {
  if (input.processing_mode !== "slm_process_aj" || row.integrationProcessingMode && row.integrationProcessingMode !== "slm_process_aj") return false;
  const legacyInput = { ...input } as Record<string, unknown>;
  delete legacyInput.processing_mode;
  if (row.integrationPayloadHash !== immutablePayloadHash(legacyInput)) return false;
  const metadata = row.integrationMetadata && typeof row.integrationMetadata === "object" ? row.integrationMetadata as Record<string, unknown> : {};
  await prisma.salesRecord.update({ where: { id: row.id }, data: {
    integrationProcessingMode: "slm_process_aj", integrationPayloadHash: hash,
    integrationMetadata: json({ ...metadata, payload: input, legacy_payload_normalized_at: new Date().toISOString() })
  } });
  return true;
}

export async function createOrResumeMjInvoice(input: MjInvoiceInput, principal: MjIntegrationPrincipal) {
  const hash = immutablePayloadHash(input);
  let row = await prisma.salesRecord.findUnique({ where: { source_externalReference: { source: "MJ", externalReference: input.external_reference } }, include: includeInvoice });
  const existed = Boolean(row);
  if (row && row.integrationPayloadHash !== hash && !await normalizeLegacyHash(row, input, hash)) {
    throw new MjIntegrationError("REFERENCE_CONFLICT", "external_reference sudah digunakan dengan payload immutable atau processing_mode berbeda.", 409, invoiceSnapshot(row));
  }
  if (!row) row = await createLocalInvoice(input, principal, hash);
  if (input.processing_mode === "slm_process_aj") {
    row = await processCustomer(row, input);
    row = await processInvoice(row, input);
    row = await processRelease(row, input);
    row = await processInitialPayment(row, input);
  }
  return { status: existed ? "already_processed" as const : "created" as const, invoice: invoiceSnapshot(row) };
}

export async function findMjInvoice(externalReference: string) {
  const row = await prisma.salesRecord.findUnique({ where: { source_externalReference: { source: "MJ", externalReference } }, include: includeInvoice });
  if (!row) throw new MjIntegrationError("VALIDATION_FAILED", "Invoice MJ tidak ditemukan.", 404);
  return row;
}

export function invoiceSnapshot(row: InvoiceRow) {
  const receivableRemaining = Number(row.total) - Number(row.initialPaymentAmount || 0);
  const external = encodeURIComponent(row.externalReference || "");
  const lastFailure = [...row.integrationAttempts].reverse().find((item) => item.status === "failed");
  return {
    slm_id: row.id, source: row.source, processing_mode: processingMode(row), external_reference: row.externalReference,
    invoice_reference: row.transactionNumber, invoice_date: row.saleDate.toISOString().slice(0, 10), total: Number(row.total),
    customer: { name: row.customerName, external_id: row.externalCustomerId, aj_customer_id: row.erpCustomerId },
    aj_invoice_id: row.erpInvoiceId, aj_invoice_number: row.erpInvoiceNumber,
    status: { customer: row.customerSyncStatus, invoice: row.syncStatus, stock_release: row.stockReleaseStatus, aj_payment: row.erpPaymentStatus },
    receivable_status: row.paymentMethod === "Tempo" ? (Number(row.initialPaymentAmount) >= Number(row.total) ? "paid" : Number(row.initialPaymentAmount) > 0 ? "partial_paid" : "open") : "not_applicable",
    remaining_amount: row.paymentMethod === "Tempo" ? Math.max(0, receivableRemaining) : 0,
    last_error: lastFailure ? { stage: lastFailure.stage, code: lastFailure.errorCode, message: lastFailure.errorMessage } : null,
    retryable: processingMode(row) === "slm_process_aj" && [row.customerSyncStatus, row.syncStatus, row.stockReleaseStatus, row.erpPaymentStatus].includes("failed"),
    print_url: `/integrations/mj/invoices/${external}/print`,
    print_text_url: `/api/integrations/mj/invoices/${external}/print?format=text`,
    print_prn_url: `/api/integrations/mj/invoices/${external}/print?format=prn`
  };
}

export async function invoiceSnapshotWithTempo(row: InvoiceRow) {
  const snapshot = invoiceSnapshot(row);
  if (row.paymentMethod !== "Tempo") return snapshot;
  const receivable = await prisma.tempoReceivable.findUnique({ where: { salesId: row.id }, select: { remainingAmount: true, status: true } });
  return receivable ? { ...snapshot, remaining_amount: Number(receivable.remainingAmount), receivable_status: receivable.status } : snapshot;
}

async function resolvePaymentAccount(row: InvoiceRow, input: MjTempoPaymentInput) {
  if (input.account.mode === "manual") {
    if ("account_reference" in input.account) return { mode: "manual", name: input.account.name, account_reference: input.account.account_reference };
    return { mode: "manual", name: input.account.name || input.account.aj_coa_reference, aj_coa_reference: input.account.aj_coa_reference };
  }
  const rekening = await prisma.rekeningAccount.findFirst({ where: { id: input.account.rekening_id, isActive: true, tipeLinks: { some: { bookkeepingTypeId: row.tipeId } } } });
  if (!rekening || (processingMode(row) === "slm_process_aj" && !rekening.erpCoaId)) throw new MjIntegrationError("ACCOUNT_INVALID", "Rekening pembayaran tidak valid untuk mode invoice.", 400);
  return { mode: "slm", rekening_id: rekening.id, name: rekening.name, erpCoaId: rekening.erpCoaId };
}

async function reserveTempoPayment(input: {
  receivableId: string;
  existingPaymentId?: string;
  paymentId: string;
  payment: MjTempoPaymentInput;
  accountName: string;
  rekeningId: string;
  erpReference?: string;
}) {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.tempoReceivable.findUnique({ where: { id: input.receivableId } });
        if (!current || input.payment.amount > Number(current.remainingAmount)) {
          throw new MjIntegrationError("PAYMENT_EXCEEDS_REMAINING", "Nominal pembayaran melebihi sisa Tempo.", 400, { remaining_amount: current ? Number(current.remainingAmount) : 0 });
        }
        const paidAmount = Number(current.paidAmount) + input.payment.amount;
        const remainingAmount = Number(current.remainingAmount) - input.payment.amount;
        if (input.existingPaymentId) {
          await tx.tempoPayment.update({ where: { id: input.existingPaymentId }, data: { erpPaymentStatus: "pending", erpPaymentError: null } });
        } else {
          await tx.tempoPayment.create({ data: {
            id: input.paymentId, tempoReceivableId: input.receivableId, paymentDate: new Date(`${input.payment.payment_date}T00:00:00.000Z`), amountPaid: input.payment.amount,
            paymentMethod: input.payment.payment_method, rekeningId: input.rekeningId, rekeningNameSnapshot: input.accountName,
            notes: input.payment.notes, erpPaymentStatus: "pending", erpPaymentReference: input.erpReference,
            externalPaymentReference: input.payment.payment_reference, createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdAt: new Date()
          } });
        }
        await tx.tempoReceivable.update({ where: { id: input.receivableId }, data: {
          paidAmount, remainingAmount, status: remainingAmount === 0 ? "paid" : "partial_paid", updatedAt: new Date()
        } });
        return remainingAmount;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && retry < 2) continue;
      throw error;
    }
  }
  throw new MjIntegrationError("INTERNAL_ERROR", "Reservasi pembayaran gagal.", 500);
}

async function releaseTempoPaymentReservation(receivableId: string, paymentId: string, amount: number, message?: string) {
  await prisma.$transaction(async (tx) => {
    const restored = await tx.tempoReceivable.update({ where: { id: receivableId }, data: {
      paidAmount: { decrement: amount }, remainingAmount: { increment: amount }, updatedAt: new Date()
    } });
    const paid = Number(restored.paidAmount);
    await tx.tempoReceivable.update({ where: { id: receivableId }, data: { status: paid <= 0 ? "open" : "partial_paid" } });
    await tx.tempoPayment.update({ where: { id: paymentId }, data: { erpPaymentStatus: "failed", erpPaymentError: message, erpPaymentAttemptedAt: new Date() } });
  });
}

export async function recordMjTempoPayment(row: InvoiceRow, input: MjTempoPaymentInput) {
  if (row.paymentMethod !== "Tempo") throw new MjIntegrationError("VALIDATION_FAILED", "Invoice bukan transaksi Tempo.", 400);
  if (row.approvalStatus === "cancelled") throw new MjIntegrationError("INVOICE_LOCKED", "Invoice sudah dibatalkan.", 409);
  const receivable = await prisma.tempoReceivable.findUnique({ where: { salesId: row.id } });
  if (!receivable || ["cancelled", "written_off"].includes(receivable.status)) throw new MjIntegrationError("INVOICE_LOCKED", "Piutang tidak dapat menerima pembayaran.", 409);
  const existing = await prisma.tempoPayment.findUnique({ where: { externalPaymentReference: input.payment_reference } });
  if (existing) {
    if (Number(existing.amountPaid) !== input.amount || existing.paymentDate.toISOString().slice(0, 10) !== input.payment_date) throw new MjIntegrationError("PAYMENT_REFERENCE_CONFLICT", "payment_reference sudah digunakan dengan payload berbeda.", 409);
    if (existing.erpPaymentSyncedAt) return { status: "already_processed" as const, payment_id: existing.id, invoice: await invoiceSnapshotWithTempo(row) };
  }
  const account = await resolvePaymentAccount(row, input);
  const localOnly = processingMode(row) !== "slm_process_aj";
  const paymentId = existing?.id || crypto.randomUUID();
  const reference = deterministicReference("payment", row.externalReference!, input.payment_reference);
  const alreadyReserved = existing?.erpPaymentStatus === "pending";
  const remaining = alreadyReserved ? Number(receivable.remainingAmount) : await reserveTempoPayment({
    receivableId: receivable.id, existingPaymentId: existing?.id, paymentId, payment: input,
    accountName: String(account.name || "Manual"), rekeningId: input.account.mode === "slm" ? input.account.rekening_id : "manual",
    erpReference: localOnly ? undefined : reference
  });
  if (!localOnly) {
    const result = await createMjPayment({ reference, invoiceId: row.erpInvoiceId!, customerId: row.erpCustomerId!, invoiceNumber: row.erpInvoiceNumber || undefined, paymentDate: input.payment_date, coaReference: accountReference(account), method: input.payment_method, amount: input.amount, notes: input.notes });
    if (!result.success) {
      await releaseTempoPaymentReservation(receivable.id, paymentId, input.amount, result.message);
      await upstreamError(result, row);
    }
  }
  const paymentStage = localOnly ? "not_required" : remaining === 0 ? "paid" : "partial";
  await prisma.tempoPayment.update({ where: { id: paymentId }, data: { erpPaymentStatus: paymentStage, erpPaymentError: null, erpPaymentSyncedAt: new Date(), erpPaymentAttemptedAt: localOnly ? null : new Date() } });
  if (!localOnly) await prisma.salesRecord.update({ where: { id: row.id }, data: { erpPaymentStatus: paymentStage, erpPaymentReference: reference, erpPaymentSyncedAt: new Date(), erpPaymentError: null } });
  const updated = await findMjInvoice(row.externalReference!);
  return { status: existing ? "already_processed" as const : "created" as const, payment_id: paymentId, remaining_amount: remaining, invoice: await invoiceSnapshotWithTempo(updated) };
}

export async function cancelMjInvoice(row: InvoiceRow, reason: string, principal: MjIntegrationPrincipal) {
  if (processingMode(row) !== "record_only") throw new MjIntegrationError("AJ_CONTRACT_PENDING", "Cancel hanya tersedia untuk record_only; invoice yang terkait AJ memerlukan kontrak reversal AJ.", 501);
  if (row.approvalStatus === "cancelled") return { status: "already_cancelled" as const, invoice: await invoiceSnapshotWithTempo(row) };
  const attemptNumber = await prisma.integrationStageAttempt.count({ where: { salesRecordId: row.id, stage: "cancel" } }) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.salesRecord.update({ where: { id: row.id }, data: { approvalStatus: "cancelled" } });
    await tx.tempoReceivable.updateMany({ where: { salesId: row.id, status: { notIn: ["cancelled", "written_off"] } }, data: { status: "cancelled", updatedAt: new Date() } });
    await tx.integrationStageAttempt.create({ data: {
      id: crypto.randomUUID(), salesRecordId: row.id, stage: "cancel", attemptNumber, status: "succeeded",
      response: json({ reason, client_id: principal.clientId, client_code: principal.clientCode, actor: "integration:mj" }),
      startedAt: new Date(), completedAt: new Date()
    } });
  });
  const updated = await findMjInvoice(row.externalReference!);
  return { status: "cancelled" as const, invoice: await invoiceSnapshotWithTempo(updated) };
}
