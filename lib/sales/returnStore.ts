import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SalesReturnStatus, SalesReturnRefundMethod } from "@prisma/client";
import type { SalesReturnInput } from "@/lib/validation/salesReturnSchema";
import { postJournalEntry, type JournalLineInput } from "@/lib/accounting/journalStore";
import { getAccountByCode, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { assertPeriodOpen } from "@/lib/accounting/periodStore";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { applySalesReturnToTempo } from "@/lib/tempo/store";

export interface ReturnActor {
  id: string;
  name: string;
  role: Role;
}

export async function generateReturnNumber(): Promise<string> {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `RET-${yearMonth}-`;

  if (typeof prisma?.salesReturn?.count !== "function") {
    return `${prefix}0001`;
  }

  const latest = await prisma.salesReturn.findFirst({
    where: { returnNumber: { startsWith: prefix } },
    orderBy: { returnNumber: "desc" },
    select: { returnNumber: true }
  });

  let nextSeq = 1;
  if (latest?.returnNumber) {
    const parts = latest.returnNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function createSalesReturn(input: SalesReturnInput, actor: ReturnActor) {
  if (typeof prisma?.salesReturn?.create !== "function") return null;

  const sale = await prisma.salesRecord.findUnique({
    where: { id: input.salesRecordId },
    include: { items: true }
  });
  if (!sale) throw new Error("Transaksi penjualan asal tidak ditemukan.");
  if (sale.approvalStatus !== "approved") {
    throw new Error(`Retur hanya dapat dibuat untuk transaksi approved. Status saat ini: ${sale.approvalStatus}`);
  }

  const returnNumber = input.returnNumber?.trim() || (await generateReturnNumber());

  // Hitung total nilai retur penjualan & total nilai modal riil barang kembali
  let subtotalAmount = 0;
  let totalCostPrice = 0;

  const itemsData = input.items.map((item) => {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const unitCost = Number(item.unitCostPrice) || 0;

    const totalAmount = Math.round(qty * unitPrice);
    const totalCost = Math.round(qty * unitCost);

    subtotalAmount += totalAmount;
    totalCostPrice += totalCost;

    return {
      salesRecordItemId: item.salesRecordItemId || null,
      productRef: item.productRef,
      productName: item.productName,
      unit: item.unit || "PCS",
      quantity: qty,
      unitPrice,
      unitCostPrice: unitCost,
      totalAmount,
      totalCost,
      reason: item.reason || null
    };
  });

  const returnRecord = await prisma.salesReturn.create({
    data: {
      returnNumber,
      salesRecordId: sale.id,
      returnDate: new Date(input.returnDate),
      customerName: input.customerName || sale.customerName,
      refundMethod: input.refundMethod as SalesReturnRefundMethod,
      rekeningAccountId: input.rekeningAccountId || null,
      subtotalAmount,
      totalCostPrice,
      status: "DRAFT",
      notes: input.notes || null,
      createdByUserId: actor.id,
      createdByNameSnapshot: actor.name,
      items: {
        create: itemsData
      }
    },
    include: {
      salesRecord: true,
      rekeningAccount: true,
      items: true
    }
  });

  await recordAudit({
    entityType: "sales",
    entityId: returnRecord.id,
    action: "create",
    afterValue: returnRecord,
    reason: `Buat draft retur penjualan ${returnRecord.returnNumber} atas nota ${sale.transactionNumber || sale.id}`
  });

  return returnRecord;
}

export async function postSalesReturn(returnId: string, actor: ReturnActor) {
  if (typeof prisma?.salesReturn?.findUnique !== "function") return null;

  const returnRecord = await prisma.salesReturn.findUnique({
    where: { id: returnId },
    include: {
      salesRecord: true,
      rekeningAccount: { include: { account: true } },
      items: true
    }
  });

  if (!returnRecord) throw new Error("Data retur penjualan tidak ditemukan.");
  if (returnRecord.status !== "DRAFT") {
    throw new Error(`Retur penjualan sudah berstatus ${returnRecord.status}, tidak bisa di-post.`);
  }

  await assertPeriodOpen(returnRecord.returnDate);
  await ensureStandardAccounts();

  // Resolve COA Accounts
  const returnSalesAccount = await getAccountByCode("4-1003");
  if (!returnSalesAccount) throw new Error("Akun Retur & Potongan Penjualan (4-1003) tidak ditemukan.");

  const receivableAccount = await getAccountByCode("1-1004");
  if (!receivableAccount) throw new Error("Akun Piutang Usaha (1-1004) tidak ditemukan.");

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");

  const inventoryAccount = await getAccountByCode("1-1005");
  if (!inventoryAccount) throw new Error("Akun Persediaan Barang Dagang (1-1005) tidak ditemukan.");

  const cogsAccount = await getAccountByCode("5-1001");
  if (!cogsAccount) throw new Error("Akun Harga Pokok Penjualan (5-1001) tidak ditemukan.");

  const subtotalAmount = Number(returnRecord.subtotalAmount);
  const totalCostPrice = Number(returnRecord.totalCostPrice);

  const lines: JournalLineInput[] = [];

  // 1. DEBIT: Retur & Potongan Penjualan (4-1003) sebesar nilai omset barang kembali
  lines.push({
    accountId: returnSalesAccount.id,
    accountCodeSnapshot: returnSalesAccount.code,
    accountNameSnapshot: returnSalesAccount.name,
    debit: subtotalAmount,
    credit: 0,
    memo: `Retur Penjualan ${returnRecord.returnNumber}: ${returnRecord.customerName}`
  });

  // 2. KREDIT: Piutang Usaha (1-1004) atau Kas & Bank (1-1001)
  if (returnRecord.refundMethod === "REDUCE_RECEIVABLE") {
    lines.push({
      accountId: receivableAccount.id,
      accountCodeSnapshot: receivableAccount.code,
      accountNameSnapshot: receivableAccount.name,
      debit: 0,
      credit: subtotalAmount,
      memo: `Potong Piutang Penjualan atas Retur ${returnRecord.returnNumber}`
    });
  } else {
    const bankAccount = returnRecord.rekeningAccount?.account || defaultCashAccount;
    lines.push({
      accountId: bankAccount.id,
      accountCodeSnapshot: bankAccount.code,
      accountNameSnapshot: returnRecord.rekeningAccount?.name || bankAccount.name,
      debit: 0,
      credit: subtotalAmount,
      memo: `Refund Kas/Bank Pengembalian Dana Retur ${returnRecord.returnNumber}`
    });
  }

  // 3. JIKA ADA MODAL RIIL: DEBIT Persediaan (1-1005) vs KREDIT HPP (5-1001)
  if (totalCostPrice > 0) {
    lines.push({
      accountId: inventoryAccount.id,
      accountCodeSnapshot: inventoryAccount.code,
      accountNameSnapshot: inventoryAccount.name,
      debit: totalCostPrice,
      credit: 0,
      memo: `Pengembalian Fisik Barang Retur ke Persediaan (${returnRecord.returnNumber})`
    });

    lines.push({
      accountId: cogsAccount.id,
      accountCodeSnapshot: cogsAccount.code,
      accountNameSnapshot: cogsAccount.name,
      debit: 0,
      credit: totalCostPrice,
      memo: `Pengurangan HPP atas Retur Barang (${returnRecord.returnNumber})`
    });
  }

  // Keseimbangan Jurnal
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    throw new Error(`Jurnal Retur Penjualan tidak seimbang! Debit=${totalDebit}, Kredit=${totalCredit}`);
  }

  const journal = await postJournalEntry(
    {
      entryDate: returnRecord.returnDate,
      sourceType: "SALES_RETURN",
      sourceId: returnRecord.id,
      postingType: "RETURN",
      tipeId: returnRecord.salesRecord.tipeId,
      tipeCodeSnapshot: returnRecord.salesRecord.tipeCodeSnapshot,
      description: `Retur Penjualan ${returnRecord.returnNumber} (${returnRecord.customerName}) - Rp ${subtotalAmount.toLocaleString("id-ID")}`,
      lines
    },
    actor
  );

  // Update Status Retur ke POSTED & tautkan Jurnal
  const updatedReturn = await prisma.salesReturn.update({
    where: { id: returnRecord.id },
    data: {
      status: "POSTED",
      journalEntryId: journal.id
    },
    include: {
      salesRecord: true,
      rekeningAccount: true,
      journalEntry: { include: { lines: true } },
      items: true
    }
  });

  await recordAudit({
    entityType: "sales",
    entityId: returnRecord.id,
    action: "approve",
    afterValue: updatedReturn,
    reason: `Posting resmi retur penjualan ${updatedReturn.returnNumber} dan Jurnal ${journal.journalNumber}`
  });

  if (returnRecord.refundMethod === "REDUCE_RECEIVABLE") {
    try {
      await applySalesReturnToTempo(returnRecord.salesRecordId, subtotalAmount, actor);
    } catch (tempoErr) {
      console.error("[postSalesReturn] Gagal apply potong piutang tempo:", tempoErr);
    }
  }

  return updatedReturn;
}

export async function listSalesReturns(params?: {
  salesRecordId?: string;
  status?: SalesReturnStatus;
  keyword?: string;
}) {
  if (typeof prisma?.salesReturn?.findMany !== "function") return [];

  const where: any = {};
  if (params?.salesRecordId) where.salesRecordId = params.salesRecordId;
  if (params?.status) where.status = params.status;
  if (params?.keyword) {
    where.OR = [
      { returnNumber: { contains: params.keyword, mode: "insensitive" } },
      { customerName: { contains: params.keyword, mode: "insensitive" } }
    ];
  }

  return prisma.salesReturn.findMany({
    where,
    orderBy: { returnDate: "desc" },
    include: {
      salesRecord: true,
      rekeningAccount: true,
      journalEntry: { include: { lines: true } },
      items: true
    }
  });
}

export async function getSalesReturnById(id: string) {
  if (typeof prisma?.salesReturn?.findUnique !== "function") return null;

  return prisma.salesReturn.findUnique({
    where: { id },
    include: {
      salesRecord: {
        include: { items: true }
      },
      rekeningAccount: true,
      journalEntry: { include: { lines: true } },
      items: true
    }
  });
}
