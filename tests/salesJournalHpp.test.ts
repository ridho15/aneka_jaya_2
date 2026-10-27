import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: {
    id: "user-owner-test",
    name: "Owner Test",
    role: "OWNER" as const
  }
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
  getCurrentRole: vi.fn(async () => mocks.user.role)
}));

import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import { getJournalEntry } from "@/lib/accounting/journalStore";
import {
  postSalesInvoiceJournal,
  postSalesCogsJournal,
  reverseSalesJournals
} from "@/lib/sales/postingHooks";
import {
  payTempo,
  reverseTempoPayment
} from "@/lib/tempo/store";
import {
  createSalesReturn,
  postSalesReturn
} from "@/lib/sales/returnStore";

describe("Fase 4: Penjualan, HPP Riil, Persediaan & Retur Terhubung Jurnal", { timeout: 45000 }, () => {
  const actor = {
    id: "user-owner-test",
    name: "Owner Test",
    role: "OWNER" as const
  };

  let testRekeningId: string;
  let cashAccountId: string;
  let receivableAccountId: string;
  let salesRevenueAccountId: string;
  let inventoryAccountId: string;
  let cogsAccountId: string;
  let returnSalesAccountId: string;

  async function createTestSaleRecord(data: any) {
    const rawItems = data.items?.create || [];
    const formattedItems = rawItems.map((it: any, idx: number) => {
      const { subtotal, ...rest } = it;
      return {
        id: rest.id || `item-${Date.now()}-${idx}-${crypto.randomUUID().slice(0, 6)}`,
        sortOrder: rest.sortOrder ?? idx,
        ...rest
      };
    });

    const { items, ...restData } = data;

    return prisma.salesRecord.create({
      data: {
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Wahana",
        customerLocation: "Padang",
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name,
        createdByRoleSnapshot: actor.role,
        createdAt: new Date(),
        ...restData,
        items: {
          create: formattedItems
        }
      },
      include: { items: true }
    });
  }

  async function createTestTempoReceivable(data: any) {
    return prisma.tempoReceivable.create({
      data: {
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Wahana",
        createdByUserId: actor.id,
        createdByNameSnapshot: actor.name,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      }
    });
  }

  beforeAll(async () => {
    // 1. Pastikan seluruh COA standar UKM tersedia (termasuk 2-1004, 4-1003, 1-1005, 5-1001)
    await ensureStandardAccounts();

    const cashAcc = await getAccountByCode("1-1001");
    const recAcc = await getAccountByCode("1-1004");
    const revAcc = await getAccountByCode("4-1001");
    const invAcc = await getAccountByCode("1-1005");
    const cogsAcc = await getAccountByCode("5-1001");
    const retAcc = await getAccountByCode("4-1003");

    expect(cashAcc).toBeDefined();
    expect(recAcc).toBeDefined();
    expect(revAcc).toBeDefined();
    expect(invAcc).toBeDefined();
    expect(cogsAcc).toBeDefined();
    expect(retAcc).toBeDefined();

    cashAccountId = cashAcc!.id;
    receivableAccountId = recAcc!.id;
    salesRevenueAccountId = revAcc!.id;
    inventoryAccountId = invAcc!.id;
    cogsAccountId = cogsAcc!.id;
    returnSalesAccountId = retAcc!.id;

    // Pastikan rekening bank penampung uji coba ada di DB
    const rek = await prisma.rekeningAccount.upsert({
      where: { id: "rek-fase4-test" },
      create: {
        id: "rek-fase4-test",
        name: "BCA Test Fase 4",
        bankName: "BCA",
        accountNumber: "5551239999",
        currency: "IDR",
        openingBalanceValas: 100000000,
        openingRate: 1,
        accountId: cashAccountId,
        isActive: true
      },
      update: {
        accountId: cashAccountId,
        isActive: true
      }
    });
    testRekeningId = rek.id;

    // Tautkan rekening ke BookkeepingType W dan AJ agar lolos validasi rekeningForTipe
    const tipeW = await prisma.bookkeepingType.findFirst({
      where: { OR: [{ id: "W" }, { code: "W" }] }
    });
    if (tipeW) {
      await prisma.rekeningAccountBookkeepingType.upsert({
        where: {
          rekeningAccountId_bookkeepingTypeId: {
            rekeningAccountId: testRekeningId,
            bookkeepingTypeId: tipeW.id
          }
        },
        create: {
          rekeningAccountId: testRekeningId,
          bookkeepingTypeId: tipeW.id
        },
        update: {}
      });
    }

    const tipeAj = await prisma.bookkeepingType.findFirst({
      where: { OR: [{ id: "AJ" }, { code: "AJ" }] }
    });
    if (tipeAj) {
      await prisma.rekeningAccountBookkeepingType.upsert({
        where: {
          rekeningAccountId_bookkeepingTypeId: {
            rekeningAccountId: testRekeningId,
            bookkeepingTypeId: tipeAj.id
          }
        },
        create: {
          rekeningAccountId: testRekeningId,
          bookkeepingTypeId: tipeAj.id
        },
        update: {}
      });
    }
  }, 45000);

  describe("1. Otomasi Jurnal Penjualan Tunai / TF", () => {
    it("memposting jurnal pendapatan penjualan tunai seimbang (Kas vs Pendapatan)", async () => {
      const saleId = `SLS-TEST-CASH-${Date.now()}`;
      const saleRecord = await createTestSaleRecord({
        id: saleId,
        transactionNumber: `NOTA-${Date.now()}`,
        tipeId: "W",
        customerName: "Bpk Budi Toko Makmur",
        paymentMethod: "TF",
        rekeningId: testRekeningId,
        rekeningNameSnapshot: "BCA Test Fase 4",
        total: 2500000,
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef: "PROD-F4-A",
              quantity: 10,
              unitPrice: 250000,
              discount: 0
            }
          ]
        }
      });

      const journal = await postSalesInvoiceJournal(saleRecord, actor);
      expect(journal).not.toBeNull();
      expect(journal!.status).toBe("POSTED");
      expect(journal!.sourceType).toBe("SALES");
      expect(journal!.postingType).toBe("INVOICE");
      expect(journal!.sourceId).toBe(saleId);

      // Keseimbangan Debit vs Kredit
      expect(Number(journal!.totalDebit)).toBe(2500000);
      expect(Number(journal!.totalCredit)).toBe(2500000);

      const debitLine = journal!.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journal!.lines.find((l) => Number(l.credit) > 0);

      expect(debitLine).toBeDefined();
      expect(debitLine!.accountId).toBe(cashAccountId);
      expect(Number(debitLine!.debit)).toBe(2500000);

      expect(creditLine).toBeDefined();
      expect(creditLine!.accountId).toBe(salesRevenueAccountId);
      expect(Number(creditLine!.credit)).toBe(2500000);

      // Verifikasi relasi di SalesRecord
      const refreshedSale = await prisma.salesRecord.findUnique({ where: { id: saleId } });
      expect(refreshedSale?.journalEntryId).toBe(journal!.id);
    }, 25000);
  });

  describe("2. Otomasi Jurnal Penjualan Tempo & Piutang", () => {
    it("memposting jurnal split antara DP Kas & Bank dan Piutang Usaha", async () => {
      const saleId = `SLS-TEST-TEMPO-${Date.now()}`;
      const totalAmount = 5000000;
      const dpAmount = 1500000;
      const sisaTempo = totalAmount - dpAmount; // 3.500.000

      const saleRecord = await createTestSaleRecord({
        id: saleId,
        transactionNumber: `NOTA-TEMPO-${Date.now()}`,
        tipeId: "AJ",
        tipeCodeSnapshot: "AJ",
        tipeNameSnapshot: "Aneka Jaya",
        customerName: "CV Maju Bersama",
        customerLocation: "Bukittinggi",
        paymentMethod: "Tempo",
        rekeningId: testRekeningId,
        rekeningNameSnapshot: "BCA Test Fase 4",
        initialPaymentAmount: dpAmount,
        initialPaymentMethod: "TF",
        initialPaymentRekeningId: testRekeningId,
        initialPaymentRekeningNameSnapshot: "BCA Test Fase 4",
        total: totalAmount,
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef: "PROD-TEMPO-X",
              quantity: 5,
              unitPrice: 1000000,
              discount: 0
            }
          ]
        }
      });

      const journal = await postSalesInvoiceJournal(saleRecord, actor);
      expect(journal).not.toBeNull();
      expect(journal!.status).toBe("POSTED");

      // Balance check
      expect(Number(journal!.totalDebit)).toBe(totalAmount);
      expect(Number(journal!.totalCredit)).toBe(totalAmount);

      // Debit DP (Kas & Bank)
      const dpLine = journal!.lines.find((l) => l.accountId === cashAccountId && Number(l.debit) > 0);
      expect(dpLine).toBeDefined();
      expect(Number(dpLine!.debit)).toBe(dpAmount);

      // Debit Piutang Usaha (1-1004)
      const recLine = journal!.lines.find((l) => l.accountId === receivableAccountId && Number(l.debit) > 0);
      expect(recLine).toBeDefined();
      expect(Number(recLine!.debit)).toBe(sisaTempo);

      // Kredit Pendapatan (4-1001)
      const revLine = journal!.lines.find((l) => l.accountId === salesRevenueAccountId && Number(l.credit) > 0);
      expect(revLine).toBeDefined();
      expect(Number(revLine!.credit)).toBe(totalAmount);
    }, 25000);
  });

  describe("3. Otomasi Pengakuan HPP Riil & Pengurangan Persediaan", () => {
    it("memposting jurnal Debit HPP (5-1001) vs Kredit Persediaan (1-1005) berdasarkan modal unit", async () => {
      const productRef = `SKU-HPP-${Date.now()}`;
      const saleId = `SLS-TEST-HPP-${Date.now()}`;
      const qty = 20;
      const unitPrice = 70000;
      const costPrice = 55000;
      const totalOmset = qty * unitPrice; // 1.400.000
      const totalHpp = qty * costPrice; // 1.100.000

      const saleRecord = await createTestSaleRecord({
        id: saleId,
        transactionNumber: `NOTA-HPP-${Date.now()}`,
        tipeId: "W",
        customerName: "Toko Bangunan Rapi",
        paymentMethod: "Cash",
        total: totalOmset,
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef,
              quantity: qty,
              unitPrice,
              discount: 0,
              manualProduct: {
                sku: productRef,
                name: "Semen Portland 50kg Test",
                costPrice
              }
            }
          ]
        }
      });

      const cogsJournal = await postSalesCogsJournal(saleRecord, actor);
      expect(cogsJournal).not.toBeNull();
      expect(cogsJournal!.status).toBe("POSTED");
      expect(cogsJournal!.sourceType).toBe("SALES");
      expect(cogsJournal!.postingType).toBe("COGS");
      expect(cogsJournal!.sourceId).toBe(saleId);

      // Balance check
      expect(Number(cogsJournal!.totalDebit)).toBe(totalHpp);
      expect(Number(cogsJournal!.totalCredit)).toBe(totalHpp);

      const hppLine = cogsJournal!.lines.find((l) => l.accountId === cogsAccountId);
      const persediaanLine = cogsJournal!.lines.find((l) => l.accountId === inventoryAccountId);

      expect(hppLine).toBeDefined();
      expect(Number(hppLine!.debit)).toBe(totalHpp);
      expect(Number(hppLine!.credit)).toBe(0);

      expect(persediaanLine).toBeDefined();
      expect(Number(persediaanLine!.debit)).toBe(0);
      expect(Number(persediaanLine!.credit)).toBe(totalHpp);

      // Verifikasi relasi di SalesRecord
      const refreshedSale = await prisma.salesRecord.findUnique({ where: { id: saleId } });
      expect(refreshedSale?.cogsJournalEntryId).toBe(cogsJournal!.id);
    }, 25000);
  });

  describe("4. Pelunasan Tempo & Jurnal Kas/Bank vs Piutang", () => {
    it("mencatat pembayaran tempo dan mem-posting jurnal Debit Kas vs Kredit Piutang", async () => {
      const salesId = `SLS-TEMPO-PAY-${Date.now()}`;
      await createTestSaleRecord({
        id: salesId,
        transactionNumber: `NOTA-TEMPO-PAY-${Date.now()}`,
        tipeId: "W",
        customerName: "Pelanggan Tempo Jaya",
        paymentMethod: "Tempo",
        total: 2000000,
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef: "PROD-TP-1",
              quantity: 2,
              unitPrice: 1000000,
              discount: 0
            }
          ]
        }
      });

      const tempoRec = await createTestTempoReceivable({
        id: `TR-${Date.now()}`,
        salesId,
        tipeId: "W",
        customerName: "Pelanggan Tempo Jaya",
        originalAmount: 2000000,
        paidAmount: 0,
        remainingAmount: 2000000,
        transactionDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 86400000),
        status: "open"
      });

      // Lakukan pembayaran Rp 1.000.000 via payTempo
      const paymentDate = new Date().toISOString().slice(0, 10);
      const { receivable, payment } = await payTempo(tempoRec.id, {
        paymentDate,
        amountPaid: 1000000,
        paymentMethod: "TF",
        rekeningId: testRekeningId,
        rekeningNameSnapshot: "BCA Test Fase 4",
        notes: "Cicilan ke-1"
      });

      expect(Number(receivable.remainingAmount)).toBe(1000000);
      expect(receivable.status).toBe("partial_paid");

      // Periksa apakah jurnal pelunasan tempo ter-posting
      const tempoJournal = await prisma.journalEntry.findFirst({
        where: {
          sourceType: "TEMPO_PAYMENT",
          sourceId: payment.id,
          postingType: "REPAYMENT",
          status: "POSTED"
        },
        include: { lines: true }
      });

      expect(tempoJournal).not.toBeNull();
      expect(Number(tempoJournal!.totalDebit)).toBe(1000000);
      expect(Number(tempoJournal!.totalCredit)).toBe(1000000);

      const debitKas = tempoJournal!.lines.find((l) => Number(l.debit) === 1000000);
      const creditPiutang = tempoJournal!.lines.find((l) => Number(l.credit) === 1000000);

      expect(debitKas?.accountId).toBe(cashAccountId);
      expect(creditPiutang?.accountId).toBe(receivableAccountId);

      // Test Reversal Pembayaran Tempo
      const { reversal } = await reverseTempoPayment(payment.id, "Koreksi salah nominal");
      expect(reversal).toBeDefined();

      // Pastikan sisa piutang tempo bertambah kembali
      const refreshedRec = await prisma.tempoReceivable.findUnique({ where: { id: tempoRec.id } });
      expect(Number(refreshedRec?.remainingAmount)).toBe(2000000);

      // Pastikan jurnal pembalik dibuat dan jurnal awal berstatus REVERSED
      const originalUpdated = await prisma.journalEntry.findUnique({ where: { id: tempoJournal!.id } });
      expect(originalUpdated?.status).toBe("REVERSED");
    }, 25000);
  });

  describe("5. Retur Penjualan & Pengurangan Piutang (SalesReturn)", () => {
    it("membuat draft retur, mem-posting jurnal retur, dan memotong sisa piutang tempo", async () => {
      // 1. Buat nota penjualan & piutang tempo asal
      const saleId = `SLS-RET-SRC-${Date.now()}`;
      const productRef = `SKU-RET-${Date.now()}`;

      const saleRecord = await createTestSaleRecord({
        id: saleId,
        transactionNumber: `NOTA-RET-${Date.now()}`,
        tipeId: "W",
        customerName: "Pak Rahman Konstruksi",
        paymentMethod: "Tempo",
        total: 2200000, // 20 dus x 110.000
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef,
              quantity: 20,
              unitPrice: 110000,
              discount: 0,
              manualProduct: {
                sku: productRef,
                name: "Keramik Granit 60x60 Test",
                costPrice: 80000
              }
            }
          ]
        }
      });

      // Tempo Receivable
      await createTestTempoReceivable({
        id: `TR-RET-${Date.now()}`,
        salesId: saleId,
        tipeId: "W",
        customerName: "Pak Rahman Konstruksi",
        originalAmount: 2200000,
        paidAmount: 0,
        remainingAmount: 2200000,
        transactionDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: "open"
      });

      // 2. Buat Draft Retur Penjualan (5 dus dikembalikan karena pecah)
      const returnDraft = await createSalesReturn(
        {
          salesRecordId: saleId,
          returnDate: new Date().toISOString().slice(0, 10),
          customerName: "Pak Rahman Konstruksi",
          refundMethod: "REDUCE_RECEIVABLE",
          notes: "5 dus keramik sudut gompal / pecah",
          items: [
            {
              productRef,
              productName: "Keramik Granit 60x60 Test",
              unit: "DUS",
              quantity: 5,
              unitPrice: 110000,
              unitCostPrice: 80000,
              reason: "Sudut gompal saat bongkar muat"
            }
          ]
        },
        actor
      );

      expect(returnDraft).not.toBeNull();
      expect(returnDraft!.status).toBe("DRAFT");
      expect(Number(returnDraft!.subtotalAmount)).toBe(550000); // 5 x 110.000
      expect(Number(returnDraft!.totalCostPrice)).toBe(400000); // 5 x 80.000

      // 3. Post Retur Penjualan Resmi
      const postedReturn = await postSalesReturn(returnDraft!.id, actor);
      expect(postedReturn).not.toBeNull();
      expect(postedReturn!.status).toBe("POSTED");
      expect(postedReturn!.journalEntryId).toBeDefined();

      // Verifikasi Jurnal Retur
      const journal = await getJournalEntry(postedReturn!.journalEntryId!);
      expect(journal).not.toBeNull();
      expect(journal!.sourceType).toBe("SALES_RETURN");
      expect(journal!.postingType).toBe("RETURN");

      // Balance check
      // Debit: 4-1003 (550.000) + Debit: 1-1005 (400.000) = 950.000
      // Kredit: 1-1004 (550.000) + Kredit: 5-1001 (400.000) = 950.000
      expect(Number(journal!.totalDebit)).toBe(950000);
      expect(Number(journal!.totalCredit)).toBe(950000);

      const debitRetur = journal!.lines.find((l) => l.accountId === returnSalesAccountId && Number(l.debit) > 0);
      const creditPiutang = journal!.lines.find((l) => l.accountId === receivableAccountId && Number(l.credit) > 0);
      const debitPersediaan = journal!.lines.find((l) => l.accountId === inventoryAccountId && Number(l.debit) > 0);
      const creditHpp = journal!.lines.find((l) => l.accountId === cogsAccountId && Number(l.credit) > 0);

      expect(Number(debitRetur?.debit)).toBe(550000);
      expect(Number(creditPiutang?.credit)).toBe(550000);
      expect(Number(debitPersediaan?.debit)).toBe(400000);
      expect(Number(creditHpp?.credit)).toBe(400000);

      // Verifikasi bahwa sisa piutang tempo berkurang sebesar nilai retur (2.200.000 - 550.000 = 1.650.000)
      const refreshedTempo = await prisma.tempoReceivable.findFirst({ where: { salesId: saleId } });
      expect(Number(refreshedTempo?.remainingAmount)).toBe(1650000);
    }, 25000);
  });

  describe("6. Pembatalan Transaksi Penjualan (Automated Reversal)", () => {
    it("membalik jurnal pendapatan dan jurnal HPP saat transaksi penjualan approved dibatalkan", async () => {
      const saleId = `SLS-CANCEL-TEST-${Date.now()}`;
      const saleRecord = await createTestSaleRecord({
        id: saleId,
        transactionNumber: `NOTA-CANCEL-${Date.now()}`,
        tipeId: "W",
        customerName: "Toko Batalkan Transaksi",
        paymentMethod: "Cash",
        total: 800000,
        approvalStatus: "approved",
        saleDate: new Date(),
        items: {
          create: [
            {
              productRef: "PROD-CANCEL-1",
              quantity: 4,
              unitPrice: 200000,
              discount: 0,
              manualProduct: {
                sku: "PROD-CANCEL-1",
                name: "Produk Batal",
                costPrice: 150000
              }
            }
          ]
        }
      });

      // Post both journals
      const invJournal = await postSalesInvoiceJournal(saleRecord, actor);
      const cogsJournal = await postSalesCogsJournal(saleRecord, actor);

      expect(invJournal).not.toBeNull();
      expect(cogsJournal).not.toBeNull();

      // Lakukan pembatalan melalui reverseSalesJournals
      const reversedResult = await reverseSalesJournals(saleId, actor, "Koreksi nota batal oleh kasir");
      expect(reversedResult.invoiceReversed).toBe(true);
      expect(reversedResult.cogsReversed).toBe(true);

      // Verifikasi status jurnal asal berubah menjadi REVERSED
      const invAfter = await prisma.journalEntry.findUnique({ where: { id: invJournal!.id } });
      const cogsAfter = await prisma.journalEntry.findUnique({ where: { id: cogsJournal!.id } });

      expect(invAfter?.status).toBe("REVERSED");
      expect(cogsAfter?.status).toBe("REVERSED");

      // Verifikasi jurnal pembalik (sourceType SALES / SALES_COGS dengan postingType REVERSAL) terbentuk
      const reversalInvoices = await prisma.journalEntry.findMany({
        where: {
          sourceType: "SALES",
          postingType: "REVERSAL",
          status: "POSTED"
        }
      });
      expect(reversalInvoices.length).toBeGreaterThan(0);
    }, 25000);
  });

  describe("7. Pemisahan Pajak PPN Keluaran (2-1004) dan Pendapatan DPP (4-1001)", () => {
    it("memposting penjualan berpajak dengan pemisahan DPP ke 4-1001 dan PPN ke 2-1004", async () => {
      const saleId = `test-sale-ppn-${Date.now()}`;
      // Transaksi Rp 11.100.000 dengan DPP Rp 10.000.000 dan PPN Rp 1.100.000
      const saleRecord = await createTestSaleRecord({
        id: saleId,
        saleDate: new Date("2026-10-25"),
        customerName: "PT Sentosa Makmur (PKP)",
        paymentMethod: "Transfer",
        rekeningId: testRekeningId,
        total: 11100000,
        approvalStatus: "approved",
        notes: "Transaksi penjualan faktur standar [PPN: Rp 1.100.000]",
        items: {
          create: [
            {
              productRef: "P-WIDGET-01",
              unitSnapshot: "PCS",
              quantity: 10,
              unitPrice: 1110000
            }
          ]
        }
      });

      const journal = await postSalesInvoiceJournal(saleRecord, actor, {
        taxAmount: 1100000
      });

      expect(journal).not.toBeNull();
      expect(Number(journal!.totalDebit)).toBe(11100000);
      expect(Number(journal!.totalCredit)).toBe(11100000);

      const lines = journal!.lines;
      const bankLine = lines.find((l) => Number(l.debit) > 0);
      const dppLine = lines.find((l) => l.accountCodeSnapshot === "4-1001");
      const ppnLine = lines.find((l) => l.accountCodeSnapshot === "2-1004");

      expect(bankLine).toBeDefined();
      expect(Number(bankLine?.debit)).toBe(11100000);

      expect(dppLine).toBeDefined();
      expect(Number(dppLine?.credit)).toBe(10000000); // Rp 10.000.000 DPP

      expect(ppnLine).toBeDefined();
      expect(Number(ppnLine?.credit)).toBe(1100000);  // Rp 1.100.000 PPN Keluaran
    });
  });
});
