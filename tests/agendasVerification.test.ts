import { beforeEach, describe, expect, it, vi } from "vitest";
import { hitungGrossProfit, buildOperationalProfitSummary, MINIMUM_REAL_COST_THRESHOLD } from "@/lib/dashboard/summary";
import type { Sale } from "@/lib/types/sales";
import type { Product } from "@/lib/types/product";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    dailyTransactionCounter: { upsert: vi.fn(async () => ({ lastValue: 1 })) },
    salesRecordItem: { deleteMany: vi.fn() },
    salesRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    tempoReceivable: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    tempoPayment: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    tempoPaymentReversal: { upsert: vi.fn() },
    auditLog: { create: vi.fn() }
  },
  user: { id: "owner-1", name: "Owner", role: "OWNER" as const },
  cancelErpSales: vi.fn(),
  releaseSaleStock: vi.fn(async () => ({ success: true, data: { status: "released", releaseReference: "SLM-STOCK-1" } })),
  cancelStockRelease: vi.fn(async () => ({ success: true, data: { status: "reversed" } })),
  nextRevisionReference: vi.fn((ref: string) => `${ref}-R1`),
  recordAudit: vi.fn(),
  findTipe: vi.fn(async () => ({ id: "tipe-w", code: "W", name: "Walk In" })),
  listAllRekeningAccounts: vi.fn(async () => []),
  resolveSalesRekening: vi.fn(async () => undefined),
  isErpTransactionSyncEnabled: vi.fn(async () => false)
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
  requireAuth: vi.fn(async () => mocks.user),
  requirePermission: vi.fn(async () => mocks.user)
}));
vi.mock("@/lib/api/salesCancellations", () => ({ cancelErpSales: mocks.cancelErpSales }));
vi.mock("@/lib/api/stockReleases", () => ({
  releaseSaleStock: mocks.releaseSaleStock,
  cancelStockRelease: mocks.cancelStockRelease,
  nextRevisionReference: mocks.nextRevisionReference
}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/business/masterData", () => ({
  findTipe: mocks.findTipe,
  listAllRekeningAccounts: mocks.listAllRekeningAccounts,
  resolveSalesRekening: mocks.resolveSalesRekening
}));
vi.mock("@/lib/services/erpSyncSettingsService", () => ({
  isErpTransactionSyncEnabled: mocks.isErpTransactionSyncEnabled
}));

import { createSale } from "@/lib/api/sales";
import { listSalesRecordsPage, updateSalesRecord } from "@/lib/sales/store";

describe("Verifikasi 3 Agenda Pekerjaan", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: any) => callback(mocks.prisma));
    mocks.prisma.dailyTransactionCounter.upsert.mockResolvedValue({ lastValue: 1 });
  });

  describe("Agenda 1: Perhitungan HPP & Margin MJ/SLM", () => {
    it("memastikan threshold MINIMUM_REAL_COST_THRESHOLD bernilai 1.000", () => {
      expect(MINIMUM_REAL_COST_THRESHOLD).toBe(1000);
    });

    it("memperlakukan modal placeholder ERP (misal Rp 500) sebagai estimasi margin 10%", () => {
      const costMap = new Map([["brg-500", 500]]);
      const sale = {
        id: "SALE-500",
        saleDate: "2026-09-05",
        total: 100000,
        items: [{ productRef: "brg-500", quantity: 1, unitPrice: 100000, discount: 0 }]
      } as Sale;
      const grossProfit = hitungGrossProfit(sale, 10, costMap);
      expect(grossProfit).toBe(10000); // 10% dari 100.000 (modal 500 <= 1000 diabaikan)
    });

    it("menggunakan modal riil jika modal > 1.000", () => {
      const costMap = new Map([["brg-real", 15000]]);
      const sale = {
        id: "SALE-REAL",
        saleDate: "2026-09-05",
        total: 40000,
        items: [{ productRef: "brg-real", quantity: 2, unitPrice: 20000, discount: 0 }]
      } as Sale;
      const grossProfit = hitungGrossProfit(sale, 10, costMap);
      expect(grossProfit).toBe(10000); // 40.000 - (2 x 15.000) = 10.000
    });

    it("memisahkan markup MJ 10% dan menghitung margin SLM secara adil", () => {
      // Penjualan MJ Rp 110.000 (sudah markup 10% dari SLM Rp 100.000)
      const saleMj = {
        id: "SALE-MJ",
        source: "MJ",
        saleDate: "2026-09-05",
        total: 110000,
        items: [{ productRef: "brg-mj", quantity: 1, unitPrice: 110000, discount: 0 }]
      } as Sale;
      // Kasus A: Tanpa modal riil -> Profit SLM = 10% x 100.000 = 10.000
      const resTanpaModal = hitungGrossProfit(saleMj, 10, new Map());
      expect(resTanpaModal).toBe(10000);

      // Kasus B: Dengan modal riil Rp 80.000 -> Profit SLM = 100.000 - 80.000 = 20.000
      const costMap = new Map([["brg-mj", 80000]]);
      const resDenganModal = hitungGrossProfit(saleMj, 10, costMap);
      expect(resDenganModal).toBe(20000);
    });

    it("verifikasi via buildOperationalProfitSummary secara keseluruhan", () => {
      const products: Product[] = [
        { id: "p-placeholder", code: "P-500", name: "Barang Placeholder", costPrice: 500 } as Product,
        { id: "p-real", code: "P-REAL", name: "Barang Riil", costPrice: 70000 } as Product
      ];
      const sales: Sale[] = [
        {
          id: "s-1",
          tipeId: "SLM",
          tipeCodeSnapshot: "SLM",
          saleDate: "2026-09-05",
          total: 100000,
          approvalStatus: "approved",
          items: [{ productRef: "P-500", productId: "p-placeholder", quantity: 1, unitPrice: 100000 }]
        } as Sale,
        {
          id: "s-2",
          source: "MJ",
          tipeId: "SLM",
          tipeCodeSnapshot: "SLM",
          saleDate: "2026-09-05",
          total: 110000,
          approvalStatus: "approved",
          items: [{ productRef: "P-REAL", productId: "p-real", quantity: 1, unitPrice: 110000 }]
        } as Sale
      ];

      const summary = buildOperationalProfitSummary(sales, [], "2026-09-05", "2026-09", 10, products);
      // s-1 profit: 10.000 (10% dari 100.000)
      // s-2 profit: 30.000 (100.000 - 70.000)
      // total gross profit: 40.000
      expect(summary.grossProfit).toBe(40000);
      expect(summary.monthlyRevenue).toBe(210000);
    });
  });

  describe("Agenda 2: Urutan Transaksi Post-Dated (Besok)", () => {
    it("mengurutkan query findMany berdasarkan saleDate DESC, transactionAt DESC, createdAt DESC", async () => {
      mocks.prisma.salesRecord.count.mockResolvedValue(2);
      mocks.prisma.salesRecord.findMany.mockResolvedValue([
        {
          id: "S-BESOK",
          saleDate: new Date("2026-09-06T00:00:00Z"),
          transactionAt: new Date("2026-09-06T10:00:00Z"),
          createdAt: new Date("2026-09-05T01:00:00Z"),
          customerName: "Pembeli Besok",
          customerLocation: "Toko",
          shippingMethod: "di Tempat",
          paymentMethod: "Cash",
          total: 50000,
          approvalStatus: "approved",
          items: []
        },
        {
          id: "S-HARIINI",
          saleDate: new Date("2026-09-05T00:00:00Z"),
          transactionAt: new Date("2026-09-05T10:00:00Z"),
          createdAt: new Date("2026-09-05T02:00:00Z"),
          customerName: "Pembeli Hari Ini",
          customerLocation: "Toko",
          shippingMethod: "di Tempat",
          paymentMethod: "Cash",
          total: 50000,
          approvalStatus: "approved",
          items: []
        }
      ]);

      const result = await listSalesRecordsPage({ page: 1, pageSize: 10 });
      expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ saleDate: "desc" }, { transactionAt: "desc" }, { createdAt: "desc" }]
        })
      );
      expect(result.data[0].id).toBe("S-BESOK");
      expect(result.data[1].id).toBe("S-HARIINI");
    });
  });

  describe("Agenda 3: Fitur Draft Penjualan & Alur Finalisasi", () => {
    it("menyimpan draft tanpa memotong stok gudang ERP dan tanpa membentuk piutang tempo", async () => {
      mocks.prisma.salesRecord.create.mockImplementation(async ({ data }: any) => ({
        ...data,
        id: "DRAFT-1",
        items: []
      }));

      const res = await createSale({
        saleDate: "2026-09-05",
        tipeId: "tipe-w",
        customerName: "Customer Draft",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Tempo",
        dueDate: "2026-09-20",
        isDraft: true,
        items: [{ productRef: "P-1", quantity: 1, unitPrice: 100000, discount: 0 }]
      });

      expect(res.success).toBe(true);
      const sale = res.data as Sale;
      expect(sale.approvalStatus).toBe("draft");
      expect(sale.stockReleaseStatus).toBe("not_required");
      // Memastikan stock release ERP tidak dipanggil
      expect(mocks.releaseSaleStock).not.toHaveBeenCalled();
      // Memastikan tempo receivable tidak dibuat saat draft
      expect(mocks.prisma.tempoReceivable.create).not.toHaveBeenCalled();
    });

    it("memperbarui draft tetap sebagai draft tanpa memotong stok", async () => {
      const existingDraft: Sale = {
        id: "DRAFT-1",
        saleDate: "2026-09-05",
        transactionAt: "2026-09-05T10:00:00.000Z",
        createdAt: "2026-09-05T10:00:00.000Z",
        tipeId: "tipe-w",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        customerName: "Customer Draft",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Tempo",
        dueDate: "2026-09-20",
        total: 100000,
        approvalStatus: "draft",
        stockReleaseStatus: "not_required",
        syncStatus: "local",
        items: []
      };

      mocks.prisma.salesRecord.findUnique.mockResolvedValue({
        ...existingDraft,
        saleDate: new Date("2026-09-05T00:00:00Z"),
        transactionAt: new Date("2026-09-05T10:00:00Z"),
        createdAt: new Date("2026-09-05T10:00:00Z"),
        items: []
      });

      mocks.prisma.salesRecord.update.mockResolvedValue({
        ...existingDraft,
        saleDate: new Date("2026-09-05T00:00:00Z"),
        transactionAt: new Date("2026-09-05T10:00:00Z"),
        createdAt: new Date("2026-09-05T10:00:00Z"),
        notes: "Update catatan draft",
        items: []
      });

      const updated = await updateSalesRecord("DRAFT-1", {
        saleDate: "2026-09-05",
        tipeId: "tipe-w",
        customerName: "Customer Draft",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Tempo",
        dueDate: "2026-09-20",
        notes: "Update catatan draft",
        isDraft: true,
        items: [{ productRef: "P-1", quantity: 1, unitPrice: 100000, discount: 0 }]
      });

      expect(updated.approvalStatus).toBe("draft");
      expect(updated.stockReleaseStatus).toBe("not_required");
      expect(mocks.releaseSaleStock).not.toHaveBeenCalled();
    });

    it("memfinalkan draft ('Finalkan & Simpan Penjualan') memotong stok gudang ERP dan mengubah status menjadi approved", async () => {
      const existingDraft: Sale = {
        id: "DRAFT-1",
        saleDate: "2026-09-05",
        transactionAt: "2026-09-05T10:00:00.000Z",
        createdAt: "2026-09-05T10:00:00.000Z",
        tipeId: "tipe-w",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        customerName: "Customer Draft",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Tempo",
        dueDate: "2026-09-20",
        total: 100000,
        approvalStatus: "draft",
        stockReleaseStatus: "not_required",
        syncStatus: "local",
        items: []
      };

      mocks.prisma.salesRecord.findUnique.mockResolvedValue({
        ...existingDraft,
        saleDate: new Date("2026-09-05T00:00:00Z"),
        transactionAt: new Date("2026-09-05T10:00:00Z"),
        createdAt: new Date("2026-09-05T10:00:00Z"),
        items: []
      });

      mocks.prisma.salesRecord.update.mockResolvedValue({
        ...existingDraft,
        saleDate: new Date("2026-09-05T00:00:00Z"),
        transactionAt: new Date("2026-09-05T10:00:00Z"),
        createdAt: new Date("2026-09-05T10:00:00Z"),
        approvalStatus: "approved",
        stockReleaseStatus: "released",
        stockReleaseReference: "SLM-STOCK-1",
        items: []
      });

      const finalized = await updateSalesRecord("DRAFT-1", {
        saleDate: "2026-09-05",
        tipeId: "tipe-w",
        customerName: "Customer Draft",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Tempo",
        dueDate: "2026-09-20",
        isDraft: false, // User klik "Finalkan & Simpan Penjualan"
        items: [{ productRef: "P-1", quantity: 1, unitPrice: 100000, discount: 0 }]
      });

      expect(finalized.approvalStatus).toBe("approved");
      expect(finalized.stockReleaseStatus).toBe("released");
      expect(mocks.releaseSaleStock).toHaveBeenCalled();
      expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: "approved",
            stockReleaseStatus: "released",
            stockReleaseReference: "SLM-STOCK-1",
            transactionAt: expect.any(Date),
            saleDate: expect.any(Date),
            transactionNumber: expect.any(String),
            transactionDateKey: expect.any(String),
            transactionSequence: expect.any(Number)
          })
        })
      );
    });

    it("memperbarui tanggal dan jam transaksi draf ke waktu sekarang saat difinalkan / di-approve", async () => {
      const draftFromYesterday: Sale = {
        id: "DRAFT-YESTERDAY",
        saleDate: "2026-09-08",
        transactionAt: "2026-09-08T08:00:00.000Z",
        createdAt: "2026-09-08T08:00:00.000Z",
        tipeId: "tipe-w",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Walk In",
        customerName: "Customer Tempo",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Cash",
        total: 250000,
        approvalStatus: "draft",
        stockReleaseStatus: "not_required",
        syncStatus: "local",
        items: []
      };

      mocks.prisma.salesRecord.findUnique.mockResolvedValue({
        ...draftFromYesterday,
        saleDate: new Date("2026-09-08T00:00:00Z"),
        transactionAt: new Date("2026-09-08T08:00:00Z"),
        createdAt: new Date("2026-09-08T08:00:00Z"),
        items: []
      });

      mocks.prisma.salesRecord.update.mockImplementation(async ({ data }) => ({
        ...draftFromYesterday,
        ...data,
        createdAt: new Date("2026-09-08T08:00:00Z"),
        saleDate: data.saleDate instanceof Date ? data.saleDate : new Date(data.saleDate),
        transactionAt: data.transactionAt instanceof Date ? data.transactionAt : new Date(data.transactionAt),
        items: []
      }));

      const finalized = await updateSalesRecord("DRAFT-YESTERDAY", {
        saleDate: "2026-09-08",
        tipeId: "tipe-w",
        customerName: "Customer Tempo",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Cash",
        isDraft: false, // klik finalkan
        items: [{ productRef: "P-1", quantity: 2, unitPrice: 125000, discount: 0 }]
      });

      expect(finalized.approvalStatus).toBe("approved");
      // Memastikan tanggal & jam transaksi bukan lagi dari tanggal draf lama (2026-09-08)
      expect(finalized.saleDate).not.toBe("2026-09-08");
      expect(finalized.transactionAt).toBeDefined();
      expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: "approved",
            transactionAt: expect.any(Date),
            saleDate: expect.any(Date)
          })
        })
      );
    });
  });
});
