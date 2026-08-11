import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { immutablePayloadHash } from "./hash";
import { MjIntegrationError } from "./errors";
import type { MjIntegrationPrincipal } from "./auth";
import type { MjInvoiceInput, MjTempoPaymentInput } from "./validation";
import { createMjErpCustomer, createMjErpInvoice, createMjPayment, deterministicReference, findMjErpCustomer, releaseMjStock } from "./erp";

const includeInvoice = { items: { orderBy: { sortOrder: "asc" as const } }, integrationAttempts: { orderBy: { startedAt: "asc" as const } } };
type InvoiceRow = Prisma.SalesRecordGetPayload<{ include: typeof includeInvoice }>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function accountReference(snapshot: unknown) {
  const row = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  return String(row.aj_coa_reference || row.erpCoaId || "");
}

async function resolveMasterData(input: MjInvoiceInput) {
  const tipe = await prisma.bookkeepingType.findFirst({ where: { code: { equals: input.bookkeeping_type_code, mode: "insensitive" }, isActive: true } });
  if (!tipe) throw new MjIntegrationError("VALIDATION_FAILED", "Tipe pembukuan tidak aktif atau tidak ditemukan.", 400, { field: "bookkeeping_type_code" });
  const account = input.payment.account;
  if (!account) return { tipe, accountSnapshot: undefined };
  if (account.mode === "manual") return { tipe, accountSnapshot: { mode: "manual", name: account.name || account.aj_coa_reference, aj_coa_reference: account.aj_coa_reference } };
  const rekening = await prisma.rekeningAccount.findFirst({
    where: { id: account.rekening_id, isActive: true, tipeLinks: { some: { bookkeepingTypeId: tipe.id } } }
  });
  if (!rekening?.erpCoaId) throw new MjIntegrationError("ACCOUNT_INVALID", "Rekening SLM tidak aktif, tidak sesuai tipe, atau belum memiliki referensi COA AJ.", 400);
  return { tipe, accountSnapshot: { mode: "slm", rekening_id: rekening.id, name: rekening.name, account_number: rekening.accountNumber, bank_name: rekening.bankName, erpCoaId: rekening.erpCoaId, erpCoaNameSnapshot: rekening.erpCoaNameSnapshot } };
}

function payloadFrom(row: InvoiceRow): MjInvoiceInput {
  const metadata = row.integrationMetadata as Record<string, unknown> | null;
  return metadata?.payload as MjInvoiceInput;
}

async function createLocalInvoice(input: MjInvoiceInput, principal: MjIntegrationPrincipal, payloadHash: string) {
  const { tipe, accountSnapshot } = await resolveMasterData(input);
  const id = crypto.randomUUID();
  const customerName = input.customer.mode === "manual" ? input.customer.name : input.customer.name || `AJ Customer ${input.customer.customer_id}`;
  const customerLocation = input.customer.mode === "manual" ? input.customer.address : undefined;
  const paidAmount = input.payment.paid_amount;
  const customerExternalId = input.customer.mode === "manual" ? input.customer.external_id : undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.salesRecord.create({
        data: {
          id, saleDate: new Date(`${input.invoice_date}T00:00:00.000Z`), transactionNumber: input.invoice_reference,
          transactionAt: new Date(`${input.invoice_date}T00:00:00.000Z`), tipeId: tipe.id, tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name, customerName, customerLocation, paymentMethod: input.payment.method,
          dueDate: input.payment.due_date ? new Date(`${input.payment.due_date}T00:00:00.000Z`) : null,
          initialPaymentAmount: input.payment.method === "Tempo" ? paidAmount : 0,
          initialPaymentMethod: input.payment.method === "Tempo" && paidAmount > 0 ? (input.payment.method === "Tempo" ? "Other" : input.payment.method) : null,
          rekeningId: input.payment.account?.mode === "slm" ? input.payment.account.rekening_id : null,
          rekeningNameSnapshot: accountSnapshot ? String((accountSnapshot as Record<string, unknown>).name || "") : null,
          notes: input.notes, total: input.total, approvalStatus: "approved", syncTarget: "erp", syncStatus: "pending",
          stockReleaseStatus: "pending", erpPaymentStatus: paidAmount > 0 ? "pending" : "not_required",
          source: "MJ", externalReference: input.external_reference, integrationPayloadHash: payloadHash,
          integrationClientId: principal.clientId, externalCustomerId: customerExternalId,
          erpCustomerId: input.customer.mode === "existing" ? Number(input.customer.customer_id) : null,
          customerSyncStatus: input.customer.mode === "existing" ? "synced" : "pending",
          accountSnapshot: accountSnapshot ? json(accountSnapshot) : undefined,
          integrationMetadata: json({ payload: input, client_code: principal.clientCode, environment: principal.environment }),
          createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdByRoleSnapshot: "OWNER",
          createdAt: new Date(),
          items: { create: input.items.map((item, index) => ({
            id: crypto.randomUUID(), productRef: item.sku || String(item.external_product_id), productId: String(item.external_product_id),
            warehouseId: String(item.warehouse_id), rackId: item.rack_id ? String(item.rack_id) : null,
            quantity: item.quantity, unitPrice: item.unit_price, discount: item.discount, sortOrder: index
          })) }
        }
      });
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
          amountPaid: paidAmount, paymentMethod: input.payment.method, rekeningId: input.payment.account?.mode === "slm" ? input.payment.account.rekening_id : "manual",
          rekeningNameSnapshot: accountSnapshot ? String((accountSnapshot as Record<string, unknown>).name || "Manual") : "Manual",
          notes: "Pembayaran awal invoice MJ", erpPaymentStatus: "pending", erpPaymentReference: deterministicReference("payment", input.external_reference, "INITIAL"),
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

async function processCustomer(row: InvoiceRow, input: MjInvoiceInput) {
  if (row.erpCustomerId && row.customerSyncStatus === "synced") return row;
  const locked = await prisma.salesRecord.updateMany({ where: { id: row.id, customerSyncStatus: { in: ["pending", "failed"] } }, data: { customerSyncStatus: "processing", customerSyncError: null } });
  if (!locked.count) throw new MjIntegrationError("INVOICE_LOCKED", "Invoice sedang diproses oleh request lain.", 409, invoiceSnapshot(row), true);
  const result = await attempt(row, "customer", async () => {
    if (input.customer.mode === "existing") return { success: true, data: { id: Number(input.customer.customer_id) } };
    const mapping = await prisma.integrationCustomerMapping.findUnique({ where: { source_externalCustomerId: { source: "MJ", externalCustomerId: input.customer.external_id } } });
    if (mapping) return { success: true, data: { id: mapping.erpCustomerId, mapped: true } };
    const existing = await findMjErpCustomer(input.customer.name);
    if (!existing.success) return existing;
    if (existing.data) return { success: true, data: existing.data };
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

async function processInvoice(row: InvoiceRow, input: MjInvoiceInput) {
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

async function processRelease(row: InvoiceRow, input: MjInvoiceInput) {
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

async function processInitialPayment(row: InvoiceRow, input: MjInvoiceInput) {
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

export async function createOrResumeMjInvoice(input: MjInvoiceInput, principal: MjIntegrationPrincipal) {
  const hash = immutablePayloadHash(input);
  let row = await prisma.salesRecord.findUnique({ where: { source_externalReference: { source: "MJ", externalReference: input.external_reference } }, include: includeInvoice });
  const existed = Boolean(row);
  if (row && row.integrationPayloadHash !== hash) throw new MjIntegrationError("REFERENCE_CONFLICT", "external_reference sudah digunakan dengan payload immutable berbeda.", 409, invoiceSnapshot(row));
  if (!row) row = await createLocalInvoice(input, principal, hash);
  row = await processCustomer(row, input);
  row = await processInvoice(row, input);
  row = await processRelease(row, input);
  row = await processInitialPayment(row, input);
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
    slm_id: row.id, source: row.source, external_reference: row.externalReference, invoice_reference: row.transactionNumber,
    invoice_date: row.saleDate.toISOString().slice(0, 10), total: Number(row.total), customer: { name: row.customerName, external_id: row.externalCustomerId, aj_customer_id: row.erpCustomerId },
    aj_invoice_id: row.erpInvoiceId, aj_invoice_number: row.erpInvoiceNumber,
    status: { customer: row.customerSyncStatus, invoice: row.syncStatus, stock_release: row.stockReleaseStatus, payment: row.erpPaymentStatus },
    remaining_amount: row.paymentMethod === "Tempo" ? Math.max(0, receivableRemaining) : 0,
    last_error: lastFailure ? { stage: lastFailure.stage, code: lastFailure.errorCode, message: lastFailure.errorMessage } : null,
    retryable: [row.customerSyncStatus, row.syncStatus, row.stockReleaseStatus, row.erpPaymentStatus].includes("failed"),
    print_url: `/integrations/mj/invoices/${external}/print`,
    print_text_url: `/api/integrations/mj/invoices/${external}/print?format=text`,
    print_prn_url: `/api/integrations/mj/invoices/${external}/print?format=prn`
  };
}

export async function invoiceSnapshotWithTempo(row: InvoiceRow) {
  const snapshot = invoiceSnapshot(row);
  if (row.paymentMethod !== "Tempo") return snapshot;
  const receivable = await prisma.tempoReceivable.findUnique({ where: { salesId: row.id }, select: { remainingAmount: true } });
  return { ...snapshot, remaining_amount: receivable ? Number(receivable.remainingAmount) : snapshot.remaining_amount };
}

export async function recordMjTempoPayment(row: InvoiceRow, input: MjTempoPaymentInput) {
  if (row.paymentMethod !== "Tempo") throw new MjIntegrationError("VALIDATION_FAILED", "Invoice bukan transaksi Tempo.", 400);
  const receivable = await prisma.tempoReceivable.findUnique({ where: { salesId: row.id } });
  if (!receivable || ["cancelled", "written_off"].includes(receivable.status)) throw new MjIntegrationError("INVOICE_LOCKED", "Piutang tidak dapat menerima pembayaran.", 409);
  const existing = await prisma.tempoPayment.findUnique({ where: { externalPaymentReference: input.payment_reference } });
  if (existing) {
    if (Number(existing.amountPaid) !== input.amount || existing.paymentDate.toISOString().slice(0, 10) !== input.payment_date) throw new MjIntegrationError("PAYMENT_REFERENCE_CONFLICT", "payment_reference sudah digunakan dengan payload berbeda.", 409);
    if (existing.erpPaymentStatus === "paid" || existing.erpPaymentStatus === "partial") return { status: "already_processed" as const, payment_id: existing.id, invoice: invoiceSnapshot(row) };
  }
  if (!existing && input.amount > Number(receivable.remainingAmount)) throw new MjIntegrationError("PAYMENT_EXCEEDS_REMAINING", "Nominal pembayaran melebihi sisa Tempo.", 400, { remaining_amount: Number(receivable.remainingAmount) });
  let account: Record<string, unknown>;
  if (input.account.mode === "manual") account = { mode: "manual", name: input.account.name || input.account.aj_coa_reference, aj_coa_reference: input.account.aj_coa_reference };
  else {
    const rekening = await prisma.rekeningAccount.findFirst({ where: { id: input.account.rekening_id, isActive: true, tipeLinks: { some: { bookkeepingTypeId: row.tipeId } } } });
    if (!rekening?.erpCoaId) throw new MjIntegrationError("ACCOUNT_INVALID", "Rekening pembayaran tidak valid.", 400);
    account = { mode: "slm", rekening_id: rekening.id, name: rekening.name, erpCoaId: rekening.erpCoaId };
  }
  const paymentId = existing?.id || crypto.randomUUID();
  if (!existing) await prisma.tempoPayment.create({ data: {
    id: paymentId, tempoReceivableId: receivable.id, paymentDate: new Date(`${input.payment_date}T00:00:00.000Z`), amountPaid: input.amount,
    paymentMethod: input.payment_method, rekeningId: input.account.mode === "slm" ? input.account.rekening_id : "manual", rekeningNameSnapshot: String(account.name || "Manual"),
    notes: input.notes, erpPaymentStatus: "pending", erpPaymentReference: deterministicReference("payment", row.externalReference!, input.payment_reference),
    externalPaymentReference: input.payment_reference, createdByUserId: "integration:mj", createdByNameSnapshot: "Integration MJ", createdAt: new Date()
  } });
  const reference = deterministicReference("payment", row.externalReference!, input.payment_reference);
  const result = await createMjPayment({ reference, invoiceId: row.erpInvoiceId!, customerId: row.erpCustomerId!, invoiceNumber: row.erpInvoiceNumber || undefined, paymentDate: input.payment_date, coaReference: accountReference(account), method: input.payment_method, amount: input.amount, notes: input.notes });
  if (!result.success) {
    await prisma.tempoPayment.update({ where: { id: paymentId }, data: { erpPaymentStatus: "failed", erpPaymentError: result.message, erpPaymentAttemptedAt: new Date() } });
    await upstreamError(result, row);
  }
  const newPaid = Number(receivable.paidAmount) + input.amount;
  const remaining = Math.max(0, Number(receivable.originalAmount) - newPaid);
  await prisma.$transaction([
    prisma.tempoPayment.update({ where: { id: paymentId }, data: { erpPaymentStatus: remaining === 0 ? "paid" : "partial", erpPaymentError: null, erpPaymentSyncedAt: new Date(), erpPaymentAttemptedAt: new Date() } }),
    prisma.tempoReceivable.update({ where: { id: receivable.id }, data: { paidAmount: newPaid, remainingAmount: remaining, status: remaining === 0 ? "paid" : "partial_paid", updatedAt: new Date() } })
  ]);
  await prisma.salesRecord.update({ where: { id: row.id }, data: { erpPaymentStatus: remaining === 0 ? "paid" : "partial", erpPaymentReference: reference, erpPaymentSyncedAt: new Date(), erpPaymentError: null } });
  const updated = await findMjInvoice(row.externalReference!);
  return { status: existing ? "already_processed" as const : "created" as const, payment_id: paymentId, remaining_amount: remaining, invoice: await invoiceSnapshotWithTempo(updated) };
}
