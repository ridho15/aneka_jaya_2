import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { ensureStandardAccounts, getAccountByCode } from "@/lib/accounting/accountStore";
import {
  allocateLandedCost,
  createSupplier,
  createPurchaseOrder,
  createPurchaseReceipt,
  createPurchaseInvoice,
  postPurchaseInvoice,
  getPurchaseInvoice,
  type LandedCostInputItem,
  type LandedCostCalculationFee
} from "@/lib/purchasing/purchasingStore";
import {
  calculateForexPreview,
  createPurchasePayment
} from "@/lib/purchasing/paymentStore";
import {
  upsertRate,
  getLatestRate,
  listRates
} from "@/lib/currency/ratesStore";
import { listAllRekeningAccounts } from "@/lib/business/masterData";

describe("Fase 3: Pembelian Valas, Landed Cost, & Multi-Currency Rekening", { timeout: 30000 }, () => {
  const actor = {
    id: "test-user-purchasing",
    name: "Purchasing Specialist",
    role: "FINANCE" as const
  };

  let testRekeningIdrId: string;
  let testRekeningUsdId: string;
  let testRekeningRmbId: string;

  beforeAll(async () => {
    // Pastikan COA standar & akun valas (1-1006, 4-1002, 6-1006) tersedia
    await ensureStandardAccounts();

    // Buat / pastikan rekening kas bank IDR & USD untuk pengujian
    const defaultKasAccount = await getAccountByCode("1-1001");

    const rekIdr = await prisma.rekeningAccount.upsert({
      where: { id: "test-rek-idr-01" },
      create: {
        id: "test-rek-idr-01",
        name: "BCA IDR Operasional Test",
        bankName: "BCA",
        accountNumber: "8881230001",
        currency: "IDR",
        openingBalanceValas: 500000000,
        openingRate: 1,
        accountId: defaultKasAccount?.id,
        isActive: true
      },
      update: {
        currency: "IDR",
        isActive: true
      }
    });
    testRekeningIdrId = rekIdr.id;

    const rekUsd = await prisma.rekeningAccount.upsert({
      where: { id: "test-rek-usd-01" },
      create: {
        id: "test-rek-usd-01",
        name: "Mandiri USD Valas Test",
        bankName: "Mandiri",
        accountNumber: "8881230002",
        currency: "USD",
        openingBalanceValas: 25000,
        openingRate: 15500,
        accountId: defaultKasAccount?.id,
        isActive: true
      },
      update: {
        currency: "USD",
        isActive: true
      }
    });
    testRekeningUsdId = rekUsd.id;

    const rekRmb = await prisma.rekeningAccount.upsert({
      where: { id: "test-rek-rmb-01" },
      create: {
        id: "test-rek-rmb-01",
        name: "BOC RMB Valas Test",
        bankName: "Bank of China",
        accountNumber: "8881230003",
        currency: "RMB",
        openingBalanceValas: 100000,
        openingRate: 2250,
        accountId: defaultKasAccount?.id,
        isActive: true
      },
      update: {
        currency: "RMB",
        isActive: true
      }
    });
    testRekeningRmbId = rekRmb.id;
  });

  // =========================================================================
  // 1. LANDED COST ALLOCATION CALCULATOR (PURE FUNCTION UNIT TESTS)
  // =========================================================================
  describe("1. Landed Cost Allocation & Tax Isolation (allocateLandedCost)", () => {
    it("mengalokasikan biaya landed cost proporsional berdasarkan nilai (BY_VALUE)", () => {
      const items: LandedCostInputItem[] = [
        { id: "item-1", itemCode: "ITM-A", itemName: "Komponen A", quantity: 10, unitPriceOriginal: 100 }, // $1,000 (1/3)
        { id: "item-2", itemCode: "ITM-B", itemName: "Komponen B", quantity: 10, unitPriceOriginal: 200 }  // $2,000 (2/3)
      ];

      const landedCosts: LandedCostCalculationFee[] = [
        {
          costType: "FREIGHT",
          isCreditableTax: false,
          amountIdr: 6000000, // Rp 6.000.000
          allocationMethod: "BY_VALUE"
        }
      ];

      const exchangeRate = 16000;
      const result = allocateLandedCost(items, landedCosts, exchangeRate);

      expect(result.totalGoodsValas).toBe(3000);
      expect(result.totalGoodsIdr).toBe(48000000);
      expect(result.totalNonCreditableLandedIdr).toBe(6000000);
      expect(result.totalCreditableTaxIdr).toBe(0);
      expect(result.grandTotalInventoryIdr).toBe(54000000);

      // Item 1 (1/3 dari Rp 6.000.000 = Rp 2.000.000)
      const resItem1 = result.items.find((it) => it.itemId === "item-1");
      expect(resItem1).toBeDefined();
      expect(resItem1?.itemBaseIdr).toBe(16000000);
      expect(resItem1?.allocatedLandedCostIdr).toBe(2000000);
      expect(resItem1?.totalCostIdr).toBe(18000000);
      expect(resItem1?.finalUnitCostIdr).toBe(1800000); // 18.000.000 / 10

      // Item 2 (2/3 dari Rp 6.000.000 = Rp 4.000.000)
      const resItem2 = result.items.find((it) => it.itemId === "item-2");
      expect(resItem2).toBeDefined();
      expect(resItem2?.itemBaseIdr).toBe(32000000);
      expect(resItem2?.allocatedLandedCostIdr).toBe(4000000);
      expect(resItem2?.totalCostIdr).toBe(36000000);
      expect(resItem2?.finalUnitCostIdr).toBe(3600000); // 36.000.000 / 10
    });

    it("mengalokasikan biaya landed cost proporsional berdasarkan kuantitas (BY_QUANTITY)", () => {
      const items: LandedCostInputItem[] = [
        { id: "item-1", itemCode: "ITM-A", itemName: "Baut Kecil", quantity: 80, unitPriceOriginal: 1 },  // 80% qty
        { id: "item-2", itemCode: "ITM-B", itemName: "Plat Besi", quantity: 20, unitPriceOriginal: 50 }   // 20% qty
      ];

      const landedCosts: LandedCostCalculationFee[] = [
        {
          costType: "HANDLING",
          isCreditableTax: false,
          amountIdr: 1000000, // Rp 1.000.000
          allocationMethod: "BY_QUANTITY"
        }
      ];

      const exchangeRate = 16000;
      const result = allocateLandedCost(items, landedCosts, exchangeRate);

      const resItem1 = result.items.find((it) => it.itemId === "item-1");
      const resItem2 = result.items.find((it) => it.itemId === "item-2");

      expect(resItem1?.allocatedLandedCostIdr).toBe(800000); // 80%
      expect(resItem2?.allocatedLandedCostIdr).toBe(200000); // 20%
    });

    it("mengisolasi pajak impor creditable (PPN & PPh 22) agar TIDAK mengkapitalisasi ke HPP barang", () => {
      const items: LandedCostInputItem[] = [
        { id: "item-1", itemCode: "ITM-A", itemName: "Mesin Pabrik", quantity: 1, unitPriceOriginal: 10000 }
      ];

      const landedCosts: LandedCostCalculationFee[] = [
        {
          costType: "FREIGHT",
          isCreditableTax: false,
          amountIdr: 10000000,
          allocationMethod: "BY_VALUE"
        },
        {
          costType: "CUSTOMS_DUTY",
          isCreditableTax: false,
          amountIdr: 8000000,
          allocationMethod: "BY_VALUE"
        },
        {
          costType: "IMPORT_TAX_PPN",
          isCreditableTax: true, // Creditable PPN Impor!
          amountIdr: 17600000,
          allocationMethod: "BY_VALUE"
        },
        {
          costType: "IMPORT_TAX_PPH22",
          isCreditableTax: true, // Creditable PPh 22 Impor!
          amountIdr: 4000000,
          allocationMethod: "BY_VALUE"
        }
      ];

      const exchangeRate = 16000;
      const result = allocateLandedCost(items, landedCosts, exchangeRate);

      // Base IDR = 1 * 10,000 * 16,000 = 160,000,000
      expect(result.totalGoodsIdr).toBe(160000000);
      // Non-creditable = 10,000,000 + 8,000,000 = 18,000,000
      expect(result.totalNonCreditableLandedIdr).toBe(18000000);
      // Creditable = 17,600,000 + 4,000,000 = 21,600,000
      expect(result.totalCreditableTaxIdr).toBe(21600000);

      // Grand total persediaan HANYA Barang + Non-Creditable = 178,000,000
      expect(result.grandTotalInventoryIdr).toBe(178000000);

      const itemRes = result.items[0];
      expect(itemRes.allocatedLandedCostIdr).toBe(18000000);
      expect(itemRes.totalCostIdr).toBe(178000000);
      expect(itemRes.finalUnitCostIdr).toBe(178000000);
    });
  });

  // =========================================================================
  // 2. EXCHANGE RATE STORE & MANAGEMENT
  // =========================================================================
  describe("2. Manajemen Kurs Valas (ratesStore)", () => {
    it("berhasil mencatat dan membaca kurs BOOKING & BANK_ACTUAL", async () => {
      const today = new Date().toISOString().split("T")[0];

      await upsertRate(
        {
          currency: "USD",
          rateDate: today,
          rateType: "BOOKING",
          rate: 16100,
          source: "Jurnal Anggaran Mingguan"
        },
        { userId: actor.id, role: actor.role }
      );

      await upsertRate(
        {
          currency: "USD",
          rateDate: today,
          rateType: "BANK_ACTUAL",
          rate: 16250,
          source: "BCA TT Counter Jual"
        },
        { userId: actor.id, role: actor.role }
      );

      const bookingRate = await getLatestRate("USD", "BOOKING");
      expect(bookingRate).toBe(16100);

      const actualRate = await getLatestRate("USD", "BANK_ACTUAL");
      expect(actualRate).toBe(16250);

      const allUsdRates = await listRates({ currency: "USD" });
      expect(allUsdRates.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 3. MULTI-CURRENCY REKENING ISOLATION
  // =========================================================================
  describe("3. Isolasi Rekening Multi-Currency (RekeningAccount)", () => {
    it("menjaga rekening USD dan IDR terisolasi dengan mata uang dan saldo awal valas masing-masing", async () => {
      const allReks = await listAllRekeningAccounts();
      const usdAcc = allReks.find((r) => r.id === testRekeningUsdId);
      const idrAcc = allReks.find((r) => r.id === testRekeningIdrId);

      expect(usdAcc).toBeDefined();
      expect(usdAcc?.currency).toBe("USD");
      expect(usdAcc?.openingBalanceValas).toBe(25000);
      expect(usdAcc?.openingRate).toBe(15500);

      expect(idrAcc).toBeDefined();
      expect(idrAcc?.currency).toBe("IDR");
      expect(idrAcc?.openingBalanceValas).toBe(500000000);
      expect(idrAcc?.openingRate).toBe(1);
    });
  });

  // =========================================================================
  // 4. PROCUREMENT LIFECYCLE & INVOICE JOURNAL WITH LANDED COST
  // =========================================================================
  describe("4. Siklus PO -> GRN -> Invoice & Landed Cost Double-Entry Journal", () => {
    let supplierId: string;
    let purchaseOrderId: string;
    let receiptId: string;
    let invoiceId: string;

    it("membuat supplier luar negeri dengan mata uang USD", async () => {
      const uniqueCode = `SUPP-USD-${Date.now().toString().slice(-4)}`;
      const supplier = await createSupplier(
        {
          code: uniqueCode,
          name: "Shenzhen Global Components Ltd",
          country: "CN",
          currency: "USD",
          email: "sales@shenzhengloballtd.cn",
          paymentTermsDays: 30,
          isActive: true
        },
        actor
      );

      expect(supplier).toBeDefined();
      expect(supplier?.currency).toBe("USD");
      supplierId = supplier!.id;
    });

    it("menerbitkan Purchase Order valas dan menerima Goods Receipt (GRN)", async () => {
      const today = new Date().toISOString().split("T")[0];

      // 1. PO: 100 unit @ $20 = $2,000, Kurs Rp 16.000
      const po = await createPurchaseOrder(
        {
          supplierId,
          orderDate: today,
          currency: "USD",
          exchangeRate: 16000,
          rateType: "BOOKING",
          items: [
            {
              itemCode: "VAL-MOD-01",
              itemName: "Module Controller SMD",
              unit: "PCS",
              quantity: 100,
              unitPriceOriginal: 20
            }
          ]
        },
        actor
      );

      expect(po).toBeDefined();
      expect(Number(po?.subtotalOriginal)).toBe(2000);
      expect(Number(po?.subtotalIdr)).toBe(32000000);
      purchaseOrderId = po!.id;

      // 2. GRN: Penerimaan barang di gudang utama
      const receipt = await createPurchaseReceipt(
        {
          purchaseOrderId: po!.id,
          receiptDate: today,
          warehouseName: "Gudang Utama Impor",
          items: [
            {
              purchaseOrderItemId: po!.items[0].id,
              quantityReceived: 100
            }
          ]
        },
        actor
      );

      expect(receipt).toBeDefined();
      expect(receipt?.items).toHaveLength(1);
      receiptId = receipt!.id;
    });

    it("menerbitkan Invoice Pembelian dengan Landed Cost dan mem-posting Jurnal Berpasangan Seimbang", async () => {
      const today = new Date().toISOString().split("T")[0];

      // Buat Invoice:
      // Subtotal Barang: $2,000 @ Kurs 16.000 = Rp 32.000.000
      // Landed Cost 1: Freight Forwarder Rp 3.000.000 (Non-Creditable, belum dibayar/utang)
      // Landed Cost 2: PPN Impor Rp 3.520.000 (Creditable Pajak, dibayar langsung via Rekening IDR)
      const invoice = await createPurchaseInvoice(
        {
          purchaseOrderId,
          supplierId,
          supplierInvoiceNumber: `INV-SZ-${Date.now().toString().slice(-4)}`,
          invoiceDate: today,
          dueDate: today,
          currency: "USD",
          exchangeRate: 16000,
          subtotalOriginal: 2000,
          landedCosts: [
            {
              costType: "FREIGHT",
              isCreditableTax: false,
              description: "Sea Freight Shenzhen - Jakarta",
              originalCurrency: "IDR",
              originalAmount: 3000000,
              exchangeRate: 1,
              amountIdr: 3000000,
              allocationMethod: "BY_VALUE"
            },
            {
              costType: "IMPORT_TAX_PPN",
              isCreditableTax: true,
              description: "PPN Impor 11%",
              originalCurrency: "IDR",
              originalAmount: 3520000,
              exchangeRate: 1,
              amountIdr: 3520000,
              allocationMethod: "BY_VALUE",
              paymentAccountId: testRekeningIdrId // Dibayar langsung via kas/bank
            }
          ]
        },
        actor
      );

      expect(invoice).toBeDefined();
      invoiceId = invoice!.id;

      // Post invoice to generate journal entry
      const posted = await postPurchaseInvoice(invoiceId, actor);
      expect(posted?.status).toBe("POSTED");

      // Ambil kembali invoice lengkap dengan relasi journal
      const loadedInv = await getPurchaseInvoice(invoiceId);
      expect(loadedInv).toBeDefined();
      expect(loadedInv?.status).toBe("POSTED");
      expect(loadedInv?.journalEntry).toBeDefined();

      const journal = loadedInv!.journalEntry!;
      const totalDebit = Number(journal.totalDebit);
      const totalCredit = Number(journal.totalCredit);

      // Total Debit = Persediaan (32M + 3M) + Pajak Dimuka (3.52M) = 38.520.000
      // Total Credit = Utang Usaha (32M + 3M) + Kas/Bank (3.52M) = 38.520.000
      expect(totalDebit).toBe(38520000);
      expect(totalCredit).toBe(38520000);
      expect(totalDebit).toBe(totalCredit);

      // Verifikasi baris-baris jurnal
      const lines = journal.lines;
      const persediaanLine = lines.find((l) => l.accountCodeSnapshot === "1-1005");
      const pajakDimukaLine = lines.find((l) => l.accountCodeSnapshot === "1-1006");
      const utangLine = lines.find((l) => l.accountCodeSnapshot === "2-1001");
      const kasLine = lines.find((l) => l.accountCodeSnapshot === "1-1001");

      expect(persediaanLine).toBeDefined();
      expect(Number(persediaanLine?.debit)).toBe(35000000); // 32M + 3M Freight

      expect(pajakDimukaLine).toBeDefined();
      expect(Number(pajakDimukaLine?.debit)).toBe(3520000); // PPN Impor

      expect(utangLine).toBeDefined();
      expect(Number(utangLine?.credit)).toBe(35000000); // Tagihan Barang + Freight belum bayar

      expect(kasLine).toBeDefined();
      expect(Number(kasLine?.credit)).toBe(3520000); // Pembayaran langsung PPN Impor via Kas
    });
  });

  // =========================================================================
  // 5. FOREX PREVIEW & REALIZED FOREX GAIN / LOSS PAYMENT JOURNALS
  // =========================================================================
  describe("5. Pembayaran Supplier Valas & Realisasi Selisih Kurs (paymentStore)", () => {
    let invoiceForPaymentId: string;

    beforeAll(async () => {
      const today = new Date().toISOString().split("T")[0];
      // Buat supplier & invoice USD $1,000 @ Kurs Rp 16.000 untuk pengujian pembayaran
      const supplier = await createSupplier(
        {
          code: `SUPP-PAY-${Date.now().toString().slice(-4)}`,
          name: "Tokyo Precision Machining",
          country: "JP",
          currency: "USD",
          paymentTermsDays: 30,
          isActive: true
        },
        actor
      );

      const inv = await createPurchaseInvoice(
        {
          supplierId: supplier!.id,
          supplierInvoiceNumber: `INV-TP-${Date.now().toString().slice(-4)}`,
          invoiceDate: today,
          dueDate: today,
          currency: "USD",
          exchangeRate: 16000,
          subtotalOriginal: 1000,
          landedCosts: []
        },
        actor
      );

      // Post invoice agar siap dibayar
      await postPurchaseInvoice(inv!.id, actor);

      invoiceForPaymentId = inv!.id;
    });

    it("menghitung preview selisih kurs dengan akurat (calculateForexPreview)", async () => {
      // 1. Kasus Rugi Kurs: Kurs bayar Rp 16.500 > Kurs Inv Rp 16.000
      const previewLoss = await calculateForexPreview({
        invoiceId: invoiceForPaymentId,
        amountPaidOriginal: 500,
        paymentRate: 16500
      });

      expect(previewLoss).toBeDefined();
      expect(previewLoss?.settledPayableIdr).toBe(8000000); // 500 * 16.000
      expect(previewLoss?.totalPaidIdr).toBe(8250000);      // 500 * 16.500
      expect(previewLoss?.forexDiffIdr).toBe(-250000);       // Rugi 250.000
      expect(previewLoss?.isLoss).toBe(true);
      expect(previewLoss?.forexAccountCode).toBe("6-1006");

      // 2. Kasus Laba Kurs: Kurs bayar Rp 15.500 < Kurs Inv Rp 16.000
      const previewGain = await calculateForexPreview({
        invoiceId: invoiceForPaymentId,
        amountPaidOriginal: 500,
        paymentRate: 15500
      });

      expect(previewGain).toBeDefined();
      expect(previewGain?.settledPayableIdr).toBe(8000000); // 500 * 16.000
      expect(previewGain?.totalPaidIdr).toBe(7750000);      // 500 * 15.500
      expect(previewGain?.forexDiffIdr).toBe(250000);        // Untung 250.000
      expect(previewGain?.isGain).toBe(true);
      expect(previewGain?.forexAccountCode).toBe("4-1002");
    });

    it("mem-posting jurnal pembayaran Valas dengan REALISASI KERUGIAN SELISIH KURS (6-1006)", async () => {
      const today = new Date().toISOString().split("T")[0];

      // Bayar sebagian: $500 pada kurs Rp 16.500 (Rugi kurs Rp 250.000)
      const payment = await createPurchasePayment(
        {
          purchaseInvoiceId: invoiceForPaymentId,
          paymentDate: today,
          rekeningAccountId: testRekeningIdrId,
          amountPaidOriginal: 500,
          paymentRate: 16500,
          notes: "Pembayaran termin 1 - Rupiah melemah"
        },
        actor
      );

      expect(payment).toBeDefined();
      expect(payment?.forexAccountCode).toBe("6-1006");
      expect(Number(payment?.forexDiffIdr)).toBe(-250000);

      // Ambil jurnal pembayaran yang otomatis terbentuk
      const paymentWithJournal = await prisma.purchasePayment.findUnique({
        where: { id: payment!.id },
        include: {
          purchaseInvoice: {
            include: {
              journalEntry: true
            }
          }
        }
      });

      // Cari JournalEntry untuk payment ini
      const paymentJournal = await prisma.journalEntry.findFirst({
        where: {
          sourceType: "PURCHASE",
          sourceId: payment!.id,
          postingType: "PAYMENT"
        },
        include: { lines: true }
      });

      expect(paymentJournal).toBeDefined();
      const totalDebit = Number(paymentJournal?.totalDebit);
      const totalCredit = Number(paymentJournal?.totalCredit);

      // Total Debit = Utang (Rp 8.000.000) + Rugi Kurs (Rp 250.000) = Rp 8.250.000
      // Total Credit = Kas & Bank (Rp 8.250.000)
      expect(totalDebit).toBe(8250000);
      expect(totalCredit).toBe(8250000);
      expect(totalDebit).toBe(totalCredit);

      // Cek masing-masing baris
      const utangLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "2-1001");
      const rugiKursLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "6-1006");
      const kasLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "1-1001");

      expect(Number(utangLine?.debit)).toBe(8000000);
      expect(Number(rugiKursLine?.debit)).toBe(250000);
      expect(Number(kasLine?.credit)).toBe(8250000);
    });

    it("mem-posting jurnal pembayaran Valas dengan REALISASI PENDAPATAN SELISIH KURS (4-1002)", async () => {
      const today = new Date().toISOString().split("T")[0];

      // Bayar sisa tagihan: $500 pada kurs Rp 15.500 (Laba kurs Rp 250.000)
      const payment = await createPurchasePayment(
        {
          purchaseInvoiceId: invoiceForPaymentId,
          paymentDate: today,
          rekeningAccountId: testRekeningIdrId,
          amountPaidOriginal: 500,
          paymentRate: 15500,
          notes: "Pelunasan invoice - Rupiah menguat"
        },
        actor
      );

      expect(payment).toBeDefined();
      expect(payment?.forexAccountCode).toBe("4-1002");
      expect(Number(payment?.forexDiffIdr)).toBe(250000);

      // Cari JournalEntry untuk pelunasan ini
      const paymentJournal = await prisma.journalEntry.findFirst({
        where: {
          sourceType: "PURCHASE",
          sourceId: payment!.id,
          postingType: "PAYMENT"
        },
        include: { lines: true }
      });

      expect(paymentJournal).toBeDefined();
      const totalDebit = Number(paymentJournal?.totalDebit);
      const totalCredit = Number(paymentJournal?.totalCredit);

      // Total Debit = Utang (Rp 8.000.000)
      // Total Credit = Kas & Bank (Rp 7.750.000) + Laba Kurs (Rp 250.000) = Rp 8.000.000
      expect(totalDebit).toBe(8000000);
      expect(totalCredit).toBe(8000000);
      expect(totalDebit).toBe(totalCredit);

      // Cek masing-masing baris
      const utangLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "2-1001");
      const labaKursLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "4-1002");
      const kasLine = paymentJournal?.lines.find((l) => l.accountCodeSnapshot === "1-1001");

      expect(Number(utangLine?.debit)).toBe(8000000);
      expect(Number(kasLine?.credit)).toBe(7750000);
      expect(Number(labaKursLine?.credit)).toBe(250000);

      // Status Invoice sekarang harus menjadi PAID
      const updatedInv = await getPurchaseInvoice(invoiceForPaymentId);
      expect(updatedInv?.status).toBe("PAID");
      expect(Number(updatedInv?.totalPaidOriginal)).toBe(1000);
    });

    it("menolak pembayaran jika jumlah bayar melebihi sisa tagihan invoice", async () => {
      const today = new Date().toISOString().split("T")[0];

      await expect(
        createPurchasePayment(
          {
            purchaseInvoiceId: invoiceForPaymentId, // Sudah lunas!
            paymentDate: today,
            rekeningAccountId: testRekeningIdrId,
            amountPaidOriginal: 100,
            paymentRate: 16000
          },
          actor
        )
      ).rejects.toThrow(/Pembayaran hanya dapat dilakukan untuk invoice berstatus POSTED atau PARTIAL_PAID/i);
    });

    it("menolak pembayaran valas silang (Bank RMB tak dapat dipilih untuk tagihan USD tanpa konversi eksplisit)", async () => {
      const today = new Date().toISOString().split("T")[0];

      // Buat supplier & invoice USD baru
      const supplier = await createSupplier(
        {
          code: `SUPP-CROSS-${Date.now().toString().slice(-4)}`,
          name: "American Silicon Parts",
          country: "US",
          currency: "USD",
          paymentTermsDays: 30,
          isActive: true
        },
        actor
      );

      const inv = await createPurchaseInvoice(
        {
          supplierId: supplier!.id,
          supplierInvoiceNumber: `INV-US-${Date.now().toString().slice(-4)}`,
          invoiceDate: today,
          dueDate: today,
          currency: "USD",
          exchangeRate: 16000,
          subtotalOriginal: 2000,
          landedCosts: []
        },
        actor
      );

      await postPurchaseInvoice(inv!.id, actor);

      // Coba bayar invoice USD menggunakan rekening Bank RMB -> WAJIB DITOLAK
      await expect(
        createPurchasePayment(
          {
            purchaseInvoiceId: inv!.id,
            paymentDate: today,
            rekeningAccountId: testRekeningRmbId, // Bank RMB!
            amountPaidOriginal: 500,
            paymentRate: 16000
          },
          actor
        )
      ).rejects.toThrow(/tidak dapat dipilih untuk tagihan USD tanpa konversi eksplisit/i);

      // Sedangkan membayar menggunakan rekening USD (mata uang cocok) berhasil
      const validPayment = await createPurchasePayment(
        {
          purchaseInvoiceId: inv!.id,
          paymentDate: today,
          rekeningAccountId: testRekeningUsdId, // Bank USD cocok!
          amountPaidOriginal: 500,
          paymentRate: 16000
        },
        actor
      );

      expect(validPayment).toBeDefined();
      expect(Number(validPayment?.amountPaidOriginal)).toBe(500);

      // Verifikasi sisa tagihan berkurang menjadi $1,500
      const updatedInv = await getPurchaseInvoice(inv!.id);
      expect(updatedInv?.status).toBe("PARTIAL_PAID");
      expect(Number(updatedInv?.totalPaidOriginal)).toBe(500);
      expect(Number(updatedInv?.totalAmountOriginal) - Number(updatedInv?.totalPaidOriginal)).toBe(1500);
    });
  });
});
