import "server-only";
import { prisma } from "@/lib/db/prisma";
import { postJournalEntry, type JournalLineInput } from "@/lib/accounting/journalStore";
import { getAccountByCode, ensureStandardAccounts } from "@/lib/accounting/accountStore";
import { assertPeriodOpen } from "@/lib/accounting/periodStore";
import type { Role } from "@/lib/auth/roles";

export interface PurchasingActor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Otomatis mem-posting jurnal untuk Invoice Pembelian & Landed Cost
 * Aturan Akuntansi:
 * - Debit Persediaan Barang Dagang (1-1005): Nilai Barang IDR + Landed Cost Non-Creditable (Ongkir, Bea Masuk, Asuransi, Handling)
 * - Debit Pajak Dibayar Dimuka (1-1006): Pajak Impor Creditable (PPN Impor, PPh 22 Impor)
 * - Kredit Utang Usaha (2-1001): Nilai Tagihan Supplier Barang IDR (+ Landed cost jika belum dibayar kas/bank)
 * - Kredit Kas & Bank (1-1001): Landed cost yang langsung dibayar via rekening
 */
export async function postPurchaseInvoiceJournal(
  invoiceId: string,
  actor: PurchasingActor
) {
  await ensureStandardAccounts();

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      supplier: true,
      landedCosts: {
        include: {
          paymentAccount: {
            include: { account: true }
          }
        }
      }
    }
  });

  if (!invoice) throw new Error("Invoice pembelian tidak ditemukan.");
  await assertPeriodOpen(invoice.invoiceDate);

  // Accounts
  const inventoryAccount = await getAccountByCode("1-1005");
  if (!inventoryAccount) throw new Error("Akun Persediaan Barang Dagang (1-1005) tidak ditemukan.");

  const prepaidTaxAccount = await getAccountByCode("1-1006");
  if (!prepaidTaxAccount) throw new Error("Akun Pajak Dibayar Dimuka (1-1006) tidak ditemukan.");

  const payableAccount = await getAccountByCode("2-1001");
  if (!payableAccount) throw new Error("Akun Utang Usaha (2-1001) tidak ditemukan.");

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");

  const subtotalIdr = Number(invoice.subtotalIdr);
  let nonCreditableLandedTotal = 0;
  let creditableTaxTotal = 0;

  const lines: JournalLineInput[] = [];

  // Group landed costs by payment method / creditable status
  const cashPaymentsByAccount: Record<string, { accountId: string; accountCode: string; amount: number; name: string }> = {};
  let landedCostPayableToVendor = 0;

  for (const lc of invoice.landedCosts) {
    const amount = Number(lc.amountIdr);
    if (lc.isCreditableTax) {
      creditableTaxTotal += amount;
    } else {
      nonCreditableLandedTotal += amount;
    }

    if (lc.paymentAccountId && lc.paymentAccount) {
      const coaCode = lc.paymentAccount.account?.code || "1-1001";
      const resolvedAcc = lc.paymentAccount.account || defaultCashAccount;
      if (!cashPaymentsByAccount[coaCode]) {
        cashPaymentsByAccount[coaCode] = {
          accountId: resolvedAcc.id,
          accountCode: coaCode,
          amount: 0,
          name: lc.paymentAccount.name
        };
      }
      cashPaymentsByAccount[coaCode].amount += amount;
    } else {
      landedCostPayableToVendor += amount;
    }
  }

  // 1. DEBIT: Persediaan Barang Dagang (Goods value + Non-creditable Landed Cost)
  const totalInventoryCapitalized = subtotalIdr + nonCreditableLandedTotal;
  lines.push({
    accountId: inventoryAccount.id,
    accountCodeSnapshot: inventoryAccount.code,
    accountNameSnapshot: inventoryAccount.name,
    debit: totalInventoryCapitalized,
    credit: 0,
    memo: `Persediaan Pembelian ${invoice.supplier.name} (${invoice.currency} ${Number(invoice.subtotalOriginal).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
  });

  // 2. DEBIT: Pajak Dibayar Dimuka (PPN & PPh Impor creditable)
  if (creditableTaxTotal > 0) {
    lines.push({
      accountId: prepaidTaxAccount.id,
      accountCodeSnapshot: prepaidTaxAccount.code,
      accountNameSnapshot: prepaidTaxAccount.name,
      debit: creditableTaxTotal,
      credit: 0,
      memo: `Pajak Impor Dibayar Dimuka (PPN/PPh22) atas Inv ${invoice.supplierInvoiceNumber}`
    });
  }

  // 3. KREDIT: Utang Usaha (Tagihan Supplier Barang + Landed cost via Utang)
  const totalPayableIdr = subtotalIdr + landedCostPayableToVendor;
  lines.push({
    accountId: payableAccount.id,
    accountCodeSnapshot: payableAccount.code,
    accountNameSnapshot: payableAccount.name,
    debit: 0,
    credit: totalPayableIdr,
    memo: `Utang Pembelian ${invoice.supplier.name} Inv ${invoice.supplierInvoiceNumber}`
  });

  // 4. KREDIT: Kas/Bank untuk landed cost yang langsung dibayarkan via rekening
  for (const accCode of Object.keys(cashPaymentsByAccount)) {
    const item = cashPaymentsByAccount[accCode];
    lines.push({
      accountId: item.accountId,
      accountCodeSnapshot: item.accountCode,
      accountNameSnapshot: item.name,
      debit: 0,
      credit: item.amount,
      memo: `Pembayaran Landed Cost via ${item.name}`
    });
  }

  // Check double-entry balance
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    throw new Error(`Jurnal Invoice Pembelian tidak seimbang! Debit=${totalDebit}, Kredit=${totalCredit}`);
  }

  const journal = await postJournalEntry(
    {
      entryDate: invoice.invoiceDate,
      sourceType: "PURCHASE",
      sourceId: invoice.id,
      postingType: "INVOICE",
      description: `Tagihan Pembelian & Landed Cost: ${invoice.supplier.name} (${invoice.supplierInvoiceNumber})`,
      lines
    },
    {
      id: actor.id,
      name: actor.name,
      role: actor.role
    }
  );

  // Link journal to invoice
  await prisma.purchaseInvoice.update({
    where: { id: invoice.id },
    data: { journalEntryId: journal.id }
  });

  return journal;
}

/**
 * Otomatis mem-posting jurnal untuk Pembayaran Valas Supplier & Selisih Kurs
 * Aturan Akuntansi:
 * - Debit Utang Usaha (2-1001): Sebesar Utang Terhapus IDR (amountPaidOriginal * invoiceRate)
 * - Kredit Kas & Bank (1-1001 / Rekening COA): Sebesar Kas Keluar IDR (amountPaidOriginal * paymentRate)
 * - Selisih Kurs (Forex Difference):
 *   - Jika forexDiff < 0 (Rugi Kurs): Debit Kerugian Selisih Kurs (6-1006)
 *   - Jika forexDiff > 0 (Laba Kurs): Kredit Pendapatan Selisih Kurs (4-1002)
 */
export async function postPurchasePaymentJournal(
  paymentId: string,
  actor: PurchasingActor
) {
  await ensureStandardAccounts();

  const payment = await prisma.purchasePayment.findUnique({
    where: { id: paymentId },
    include: {
      supplier: true,
      purchaseInvoice: true,
      rekeningAccount: {
        include: { account: true }
      }
    }
  });

  if (!payment) throw new Error("Data pembayaran supplier tidak ditemukan.");
  await assertPeriodOpen(payment.paymentDate);

  const defaultCashAccount = await getAccountByCode("1-1001");
  if (!defaultCashAccount) throw new Error("Akun Kas & Bank (1-1001) tidak ditemukan.");

  const payableAccount = await getAccountByCode("2-1001");
  if (!payableAccount) throw new Error("Akun Utang Usaha (2-1001) tidak ditemukan.");

  const forexLossAccount = await getAccountByCode("6-1006");
  if (!forexLossAccount) throw new Error("Akun Kerugian Selisih Kurs (6-1006) tidak ditemukan.");

  const forexGainAccount = await getAccountByCode("4-1002");
  if (!forexGainAccount) throw new Error("Akun Pendapatan Selisih Kurs (4-1002) tidak ditemukan.");

  const bankAccount = payment.rekeningAccount.account || defaultCashAccount;

  const settledPayableIdr = Number(payment.settledPayableIdr);
  const totalPaidIdr = Number(payment.totalPaidIdr);
  const forexDiffIdr = Number(payment.forexDiffIdr);

  const lines: JournalLineInput[] = [];

  // 1. DEBIT: Utang Usaha sebesar nilai utang buku awal yang dilunasi
  lines.push({
    accountId: payableAccount.id,
    accountCodeSnapshot: payableAccount.code,
    accountNameSnapshot: payableAccount.name,
    debit: settledPayableIdr,
    credit: 0,
    memo: `Pelunasan Utang ${payment.supplier.name} (${payment.currency} ${Number(payment.amountPaidOriginal).toLocaleString("en-US", { minimumFractionDigits: 2 })}) Kurs Inv ${Number(payment.invoiceRate).toLocaleString("id-ID")}`
  });

  // 2. KREDIT: Kas & Bank sebesar rupiah aktual yang keluar
  lines.push({
    accountId: bankAccount.id,
    accountCodeSnapshot: bankAccount.code,
    accountNameSnapshot: payment.rekeningAccount.name,
    debit: 0,
    credit: totalPaidIdr,
    memo: `Keluar Kas/Bank ${payment.rekeningAccount.name} Kurs Bayar ${Number(payment.paymentRate).toLocaleString("id-ID")}`
  });

  // 3. SELISIH KURS
  if (forexDiffIdr < 0) {
    // Rugi Kurs (Debit 6-1006)
    const lossAmount = Math.abs(forexDiffIdr);
    lines.push({
      accountId: forexLossAccount.id,
      accountCodeSnapshot: forexLossAccount.code,
      accountNameSnapshot: forexLossAccount.name,
      debit: lossAmount,
      credit: 0,
      memo: `Rugi Selisih Kurs Valas Pembayaran ${payment.currency}`
    });
  } else if (forexDiffIdr > 0) {
    // Laba Kurs (Kredit 4-1002)
    lines.push({
      accountId: forexGainAccount.id,
      accountCodeSnapshot: forexGainAccount.code,
      accountNameSnapshot: forexGainAccount.name,
      debit: 0,
      credit: forexDiffIdr,
      memo: `Laba Selisih Kurs Valas Pembayaran ${payment.currency}`
    });
  }

  // Check double-entry balance
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    throw new Error(`Jurnal Pembayaran Valas tidak seimbang! Debit=${totalDebit}, Kredit=${totalCredit}`);
  }

  const journal = await postJournalEntry(
    {
      entryDate: payment.paymentDate,
      sourceType: "PURCHASE",
      sourceId: payment.id,
      postingType: "PAYMENT",
      description: `Pembayaran Valas: ${payment.supplier.name} - Inv ${payment.purchaseInvoice.supplierInvoiceNumber}`,
      lines
    },
    {
      id: actor.id,
      name: actor.name,
      role: actor.role
    }
  );

  // Link journal to payment
  await prisma.purchasePayment.update({
    where: { id: payment.id },
    data: { journalEntryId: journal.id }
  });

  return journal;
}
