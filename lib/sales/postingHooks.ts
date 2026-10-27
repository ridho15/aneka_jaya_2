import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SalesRecord } from "@prisma/client";
import { postJournalEntry, reverseJournalEntry, type JournalLineInput } from "@/lib/accounting/journalStore";
import { getAccountByCode, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { assertPeriodOpen } from "@/lib/accounting/periodStore";
import type { Role } from "@/lib/auth/roles";

export interface SalesPostingActor {
  id: string;
  name: string;
  role: Role;
}

export interface SalesInvoiceJournalOptions {
  taxAmount?: number;
  taxRate?: number;
  isTaxInclusive?: boolean;
}

const MINIMUM_REAL_COST_THRESHOLD = 1000;

/**
 * Otomatis mem-posting jurnal pengakuan pendapatan & piutang saat penjualan disetujui (Approved).
 * Aturan Akuntansi:
 * - Penjualan Tunai/Transfer:
 *     Debit Kas & Bank (1-1001 / Rekening COA)
 *     Kredit Pendapatan Penjualan (4-1001) [sebesar DPP]
 *     Kredit Utang PPN Keluaran (2-1004) [sebesar PPN jika berlaku]
 * - Penjualan Tempo:
 *     Debit Kas & Bank (1-1001) [sebesar uang muka / DP yang dibayar langsung]
 *     Debit Piutang Usaha (1-1004) [sebesar sisa piutang tempo]
 *     Kredit Pendapatan Penjualan (4-1001) [sebesar DPP]
 *     Kredit Utang PPN Keluaran (2-1004) [sebesar PPN jika berlaku]
 */
export async function postSalesInvoiceJournal(
  saleOrId: string | SalesRecord,
  actor?: SalesPostingActor,
  options?: SalesInvoiceJournalOptions
) {
  await ensureStandardAccounts();

  const id = typeof saleOrId === "string" ? saleOrId : (saleOrId as any).id;
  const sale =
    typeof saleOrId === "object" && "items" in saleOrId && Array.isArray((saleOrId as any).items)
      ? (saleOrId as any)
      : await prisma.salesRecord.findUnique({
          where: { id },
          include: {
            items: true
          }
        });

  if (!sale) throw new Error("Data penjualan tidak ditemukan.");
  if (sale.approvalStatus !== "approved") {
    // Hanya penjualan berstatus approved yang dijurnal resmi
    return null;
  }

  await assertPeriodOpen(sale.saleDate);

  const effectiveActor: SalesPostingActor = actor || {
    id: sale.createdByUserId,
    name: sale.createdByNameSnapshot,
    role: (sale.createdByRoleSnapshot as Role) || "FINANCE"
  };

  const totalSale = Number(sale.total) || 0;
  if (totalSale <= 0) return null;

  // Resolve COA Accounts
  const revenueAccount = await getAccountByCode("4-1001");
  if (!revenueAccount) throw new Error("Akun Pendapatan Penjualan (4-1001) tidak ditemukan.");

  const receivableAccount = await getAccountByCode("1-1004");
  if (!receivableAccount) throw new Error("Akun Piutang Usaha (1-1004) tidak ditemukan.");

  const ppnAccount = await getAccountByCode("2-1004");

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");

  // Resolve rekening penerima pembayaran
  let bankAccount = defaultCashAccount;
  if (sale.rekeningId) {
    const rek = await prisma.rekeningAccount.findUnique({
      where: { id: sale.rekeningId },
      include: { account: true }
    });
    if (rek?.account) {
      bankAccount = rek.account;
    }
  }

  // Resolve PPN Keluaran jika transaksi memiliki pajak
  let taxAmount = 0;
  if (options?.taxAmount !== undefined && options.taxAmount > 0) {
    taxAmount = Math.round(options.taxAmount);
  } else if (options?.taxRate !== undefined && options.taxRate > 0) {
    if (options.isTaxInclusive !== false) {
      const dpp = Math.round(totalSale / (1 + options.taxRate));
      taxAmount = totalSale - dpp;
    } else {
      taxAmount = Math.round(totalSale * options.taxRate);
    }
  } else if (sale.integrationMetadata && typeof sale.integrationMetadata === "object") {
    const meta = sale.integrationMetadata as Record<string, unknown>;
    if (typeof meta.taxAmount === "number" && meta.taxAmount > 0) {
      taxAmount = Math.round(meta.taxAmount);
    } else if (typeof meta.tax === "number" && meta.tax > 0) {
      taxAmount = Math.round(meta.tax);
    } else if (meta.payload && typeof meta.payload === "object") {
      const payloadInvoice = (meta.payload as Record<string, unknown>).invoice as Record<string, unknown> | undefined;
      if (payloadInvoice && typeof payloadInvoice.tax === "number" && payloadInvoice.tax > 0) {
        taxAmount = Math.round(payloadInvoice.tax);
      }
    }
  } else if (sale.notes) {
    const rpMatch = sale.notes.match(/\[PPN:\s*Rp\s*([\d\.]+)\]/i);
    if (rpMatch && rpMatch[1]) {
      const parsed = parseFloat(rpMatch[1].replace(/\./g, ""));
      if (parsed > 0) taxAmount = Math.round(parsed);
    } else {
      const pctMatch = sale.notes.match(/\[PPN:\s*([\d\.]+)%\]/i);
      if (pctMatch && pctMatch[1]) {
        const rate = parseFloat(pctMatch[1]) / 100;
        if (rate > 0) {
          const dpp = Math.round(totalSale / (1 + rate));
          taxAmount = totalSale - dpp;
        }
      }
    }
  }

  if (taxAmount >= totalSale) {
    taxAmount = 0; // Guard against abnormal tax
  }

  const dppAmount = totalSale - taxAmount;

  const lines: JournalLineInput[] = [];
  const paymentMethod = sale.paymentMethod?.toUpperCase();

  if (paymentMethod === "TEMPO") {
    const initialPaid = Number(sale.initialPaymentAmount) || 0;
    const remainingReceivable = Math.max(0, totalSale - initialPaid);

    // 1. Debit Kas/Bank jika ada DP / pembayaran awal
    if (initialPaid > 0) {
      let dpAccount = defaultCashAccount;
      if (sale.initialPaymentRekeningId) {
        const dpRek = await prisma.rekeningAccount.findUnique({
          where: { id: sale.initialPaymentRekeningId },
          include: { account: true }
        });
        if (dpRek?.account) dpAccount = dpRek.account;
      }

      lines.push({
        accountId: dpAccount.id,
        accountCodeSnapshot: dpAccount.code,
        accountNameSnapshot: dpAccount.name,
        debit: initialPaid,
        credit: 0,
        memo: `DP Penjualan Tempo: ${sale.customerName} (${sale.transactionNumber || sale.id})`
      });
    }

    // 2. Debit Piutang Usaha untuk sisa tagihan tempo
    if (remainingReceivable > 0) {
      lines.push({
        accountId: receivableAccount.id,
        accountCodeSnapshot: receivableAccount.code,
        accountNameSnapshot: receivableAccount.name,
        debit: remainingReceivable,
        credit: 0,
        memo: `Piutang Usaha Tempo: ${sale.customerName} (${sale.transactionNumber || sale.id})`
      });
    }

    // 3. Kredit Pendapatan Penjualan (DPP)
    lines.push({
      accountId: revenueAccount.id,
      accountCodeSnapshot: revenueAccount.code,
      accountNameSnapshot: revenueAccount.name,
      debit: 0,
      credit: dppAmount,
      memo: taxAmount > 0
        ? `Pendapatan Penjualan DPP: ${sale.customerName} (${sale.transactionNumber || sale.id})`
        : `Pendapatan Penjualan Tempo: ${sale.customerName} (${sale.transactionNumber || sale.id})`
    });

    // 4. Kredit Utang PPN Keluaran (2-1004) jika ada pajak
    if (taxAmount > 0 && ppnAccount) {
      lines.push({
        accountId: ppnAccount.id,
        accountCodeSnapshot: ppnAccount.code,
        accountNameSnapshot: ppnAccount.name,
        debit: 0,
        credit: taxAmount,
        memo: `Utang PPN Keluaran: ${sale.customerName} (${sale.transactionNumber || sale.id})`
      });
    }
  } else {
    // Penjualan Tunai / Transfer (Lunas)
    lines.push({
      accountId: bankAccount.id,
      accountCodeSnapshot: bankAccount.code,
      accountNameSnapshot: bankAccount.name,
      debit: totalSale,
      credit: 0,
      memo: `Penerimaan Kas/Bank Penjualan: ${sale.customerName} (${sale.transactionNumber || sale.id})`
    });

    // Kredit Pendapatan Penjualan (DPP)
    lines.push({
      accountId: revenueAccount.id,
      accountCodeSnapshot: revenueAccount.code,
      accountNameSnapshot: revenueAccount.name,
      debit: 0,
      credit: dppAmount,
      memo: taxAmount > 0
        ? `Pendapatan Penjualan DPP: ${sale.customerName} (${sale.transactionNumber || sale.id})`
        : `Pendapatan Penjualan: ${sale.customerName} (${sale.transactionNumber || sale.id})`
    });

    // Kredit Utang PPN Keluaran (2-1004) jika ada pajak
    if (taxAmount > 0 && ppnAccount) {
      lines.push({
        accountId: ppnAccount.id,
        accountCodeSnapshot: ppnAccount.code,
        accountNameSnapshot: ppnAccount.name,
        debit: 0,
        credit: taxAmount,
        memo: `Utang PPN Keluaran: ${sale.customerName} (${sale.transactionNumber || sale.id})`
      });
    }
  }

  // Double-entry validation
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    throw new Error(`Jurnal Penjualan tidak seimbang! Debit=${totalDebit}, Kredit=${totalCredit}`);
  }

  const journal = await postJournalEntry(
    {
      entryDate: sale.saleDate,
      sourceType: "SALES",
      sourceId: sale.id,
      postingType: "INVOICE",
      tipeId: sale.tipeId,
      tipeCodeSnapshot: sale.tipeCodeSnapshot,
      description: `Penjualan ${sale.transactionNumber || sale.id}: ${sale.customerName} (Rp ${totalSale.toLocaleString("id-ID")})`,
      lines
    },
    effectiveActor
  );

  // Link journal to sales record
  await prisma.salesRecord.update({
    where: { id: sale.id },
    data: { journalEntryId: journal.id }
  });

  return journal;
}

/**
 * Otomatis mem-posting jurnal pengakuan Harga Pokok Penjualan (HPP) & pengurangan persediaan.
 * Aturan Akuntansi:
 * - Debit Harga Pokok Penjualan (5-1001)
 * - Kredit Persediaan Barang Dagang (1-1005)
 * Dihitung dari akumulasi modal riil per item terjual.
 */
export async function postSalesCogsJournal(
  saleOrId: string | SalesRecord,
  actor?: SalesPostingActor
) {
  await ensureStandardAccounts();

  const id = typeof saleOrId === "string" ? saleOrId : (saleOrId as any).id;
  const sale =
    typeof saleOrId === "object" && "items" in saleOrId && Array.isArray((saleOrId as any).items)
      ? (saleOrId as any)
      : await prisma.salesRecord.findUnique({
          where: { id },
          include: {
            items: true
          }
        });

  if (!sale) throw new Error("Data penjualan tidak ditemukan.");
  if (sale.approvalStatus !== "approved") return null;

  await assertPeriodOpen(sale.saleDate);

  const effectiveActor: SalesPostingActor = actor || {
    id: sale.createdByUserId,
    name: sale.createdByNameSnapshot,
    role: (sale.createdByRoleSnapshot as Role) || "FINANCE"
  };

  // Resolve COA
  const cogsAccount = await getAccountByCode("5-1001");
  if (!cogsAccount) throw new Error("Akun Harga Pokok Penjualan (5-1001) tidak ditemukan.");

  const inventoryAccount = await getAccountByCode("1-1005");
  if (!inventoryAccount) throw new Error("Akun Persediaan Barang Dagang (1-1005) tidak ditemukan.");

  // Hitung modal riil per item
  let totalCogs = 0;
  for (const item of sale.items) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;

    let unitCost = 0;

    // Prioritas 1: Input manual barang (jika > Rp 1.000)
    const manualData = item.manualProduct as Record<string, unknown> | null;
    const manualCost = Number(manualData?.costPrice);
    if (Number.isFinite(manualCost) && manualCost > MINIMUM_REAL_COST_THRESHOLD) {
      unitCost = manualCost;
    }

    // Prioritas 2: Cari harga beli / HPP dari item penerimaan barang pembelian (PO / GRN / Invoice)
    if (unitCost <= 0 && item.productRef) {
      const latestPurchaseItem = await prisma.purchaseOrderItem.findFirst({
        where: { itemCode: item.productRef },
        orderBy: { purchaseOrder: { orderDate: "desc" } },
        select: { unitPriceIdr: true }
      });
      if (latestPurchaseItem && Number(latestPurchaseItem.unitPriceIdr) > MINIMUM_REAL_COST_THRESHOLD) {
        unitCost = Number(latestPurchaseItem.unitPriceIdr);
      }
    }

    // Fallback: Jika belum ada modal riil, gunakan estimasi berbasis harga jual (margin 15%)
    if (unitCost <= 0) {
      const sellPrice = Number(item.unitPrice) || 0;
      unitCost = Math.round(sellPrice * 0.85); // 85% HPP fallback
    }

    totalCogs += Math.round(qty * unitCost);
  }

  if (totalCogs <= 0) return null;

  const lines: JournalLineInput[] = [
    {
      accountId: cogsAccount.id,
      accountCodeSnapshot: cogsAccount.code,
      accountNameSnapshot: cogsAccount.name,
      debit: totalCogs,
      credit: 0,
      memo: `HPP Penjualan ${sale.transactionNumber || sale.id}: ${sale.customerName}`
    },
    {
      accountId: inventoryAccount.id,
      accountCodeSnapshot: inventoryAccount.code,
      accountNameSnapshot: inventoryAccount.name,
      debit: 0,
      credit: totalCogs,
      memo: `Pengurangan Persediaan Barang Dagang (${sale.transactionNumber || sale.id})`
    }
  ];

  const journal = await postJournalEntry(
    {
      entryDate: sale.saleDate,
      sourceType: "SALES",
      sourceId: sale.id,
      postingType: "COGS",
      tipeId: sale.tipeId,
      tipeCodeSnapshot: sale.tipeCodeSnapshot,
      description: `HPP & Pengurangan Persediaan: ${sale.transactionNumber || sale.id} (${sale.customerName})`,
      lines
    },
    effectiveActor
  );

  await prisma.salesRecord.update({
    where: { id: sale.id },
    data: { cogsJournalEntryId: journal.id }
  });

  return journal;
}

/**
 * Membalik seluruh jurnal penjualan (Invoice & COGS) ketika transaksi dibatalkan (Cancelled).
 */
export async function reverseSalesJournals(
  salesRecordId: string,
  actor: SalesPostingActor,
  reason: string
) {
  const sale = await prisma.salesRecord.findUnique({
    where: { id: salesRecordId },
    select: {
      id: true,
      journalEntryId: true,
      cogsJournalEntryId: true
    }
  });

  if (!sale) return { invoiceReversed: false, cogsReversed: false };

  let invoiceReversed = false;
  let cogsReversed = false;

  // 1. Reversal Jurnal Invoice Penjualan
  if (sale.journalEntryId) {
    try {
      await reverseJournalEntry(sale.journalEntryId, actor, reason);
      invoiceReversed = true;
    } catch (err) {
      console.warn(`[REVERSAL] Gagal membalik jurnal penjualan ${sale.journalEntryId}:`, err);
    }
  }

  // 2. Reversal Jurnal HPP
  if (sale.cogsJournalEntryId) {
    try {
      await reverseJournalEntry(sale.cogsJournalEntryId, actor, reason);
      cogsReversed = true;
    } catch (err) {
      console.warn(`[REVERSAL] Gagal membalik jurnal HPP ${sale.cogsJournalEntryId}:`, err);
    }
  }

  return { invoiceReversed, cogsReversed };
}
