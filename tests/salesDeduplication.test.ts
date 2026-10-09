import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  listSalesRecords: vi.fn(),
  prismaFindFirst: vi.fn()
}));

vi.mock("@/lib/sales/store", () => ({
  listSalesRecords: mocks.listSalesRecords
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesRecord: {
      findFirst: mocks.prismaFindFirst
    }
  }
}));

import {
  acquireSalesLock,
  releaseSalesLock,
  findExistingSaleByRequestId,
  findSemanticDuplicateSale
} from "@/lib/sales/deduplication";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { Sale } from "@/lib/types/sales";

describe("Sales Deduplication and In-Flight Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("In-Flight Lock (Layer 2)", () => {
    it("acquires lock successfully for new requestId", () => {
      const reqId = "req-test-1";
      expect(acquireSalesLock(reqId)).toBe(true);
      releaseSalesLock(reqId);
    });

    it("rejects lock acquisition when request is currently in-flight", () => {
      const reqId = "req-test-2";
      expect(acquireSalesLock(reqId)).toBe(true);
      expect(acquireSalesLock(reqId)).toBe(false); // Second attempt blocked
      releaseSalesLock(reqId);
    });

    it("allows re-acquiring lock after release", () => {
      const reqId = "req-test-3";
      expect(acquireSalesLock(reqId)).toBe(true);
      releaseSalesLock(reqId);
      expect(acquireSalesLock(reqId)).toBe(true);
      releaseSalesLock(reqId);
    });

    it("gracefully handles undefined clientRequestId", () => {
      expect(acquireSalesLock(undefined)).toBe(true);
      releaseSalesLock(undefined);
    });
  });

  describe("Idempotency Lookup (Layer 2)", () => {
    it("returns existing sale matching externalReference", async () => {
      const existingSale: Sale = {
        id: "S-100",
        transactionNumber: "INV-202610-0001",
        externalReference: "client-req-abc",
        customerName: "Budi",
        items: [],
        total: 100000,
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date().toISOString(),
        saleDate: "2026-10-09"
      };

      mocks.listSalesRecords.mockResolvedValue([existingSale]);
      mocks.prismaFindFirst.mockResolvedValue(null);

      const result = await findExistingSaleByRequestId("client-req-abc");
      expect(result).toBeDefined();
      expect(result?.id).toBe("S-100");
    });

    it("returns undefined if no matching requestId found", async () => {
      mocks.listSalesRecords.mockResolvedValue([]);
      mocks.prismaFindFirst.mockResolvedValue(null);

      const result = await findExistingSaleByRequestId("client-req-nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("Semantic Duplicate Detection (Layer 3)", () => {
    const baseInput: PenjualanInput = {
      tipeId: "W",
      customerName: "Toko Sinar Jaya",
      customerPhone: "08123456789",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      saleDate: "2026-10-09",
      transactionAt: new Date().toISOString(),
      items: [
        {
          productRef: "BRG-001",
          quantity: 5,
          unitPrice: 20000,
          discount: 0
        },
        {
          productRef: "BRG-002",
          quantity: 2,
          unitPrice: 50000,
          discount: 0
        }
      ]
    };

    it("detects duplicate when same customer, items, and total submitted within 15 minutes", async () => {
      const existingSale: Sale = {
        id: "S-200",
        transactionNumber: "INV-202610-0002",
        customerName: "Toko Sinar Jaya",
        total: 200000, // (5 * 20000) + (2 * 50000) = 200000
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 mins ago
        saleDate: "2026-10-09",
        items: [
          {
            productRef: "BRG-001",
            quantity: 5,
            unitPrice: 20000,
            discount: 0
          },
          {
            productRef: "BRG-002",
            quantity: 2,
            unitPrice: 50000,
            discount: 0
          }
        ]
      };

      mocks.listSalesRecords.mockResolvedValue([existingSale]);

      const duplicate = await findSemanticDuplicateSale(baseInput);
      expect(duplicate).toBeDefined();
      expect(duplicate?.id).toBe("S-200");
    });

    it("ignores duplicate when allowDuplicate is true (User confirmation override)", async () => {
      const existingSale: Sale = {
        id: "S-200",
        transactionNumber: "INV-202610-0002",
        customerName: "Toko Sinar Jaya",
        total: 200000,
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        saleDate: "2026-10-09",
        items: baseInput.items
      };

      mocks.listSalesRecords.mockResolvedValue([existingSale]);

      const duplicate = await findSemanticDuplicateSale({
        ...baseInput,
        allowDuplicate: true
      });
      expect(duplicate).toBeUndefined();
    });

    it("ignores drafts from triggering or matching semantic duplicate", async () => {
      mocks.listSalesRecords.mockResolvedValue([]);

      const duplicate = await findSemanticDuplicateSale({
        ...baseInput,
        isDraft: true
      });
      expect(duplicate).toBeUndefined();
    });

    it("ignores sales created more than 15 minutes ago", async () => {
      const oldSale: Sale = {
        id: "S-201",
        transactionNumber: "INV-202610-0001",
        customerName: "Toko Sinar Jaya",
        total: 200000,
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 mins ago
        saleDate: "2026-10-09",
        items: baseInput.items
      };

      mocks.listSalesRecords.mockResolvedValue([oldSale]);

      const duplicate = await findSemanticDuplicateSale(baseInput);
      expect(duplicate).toBeUndefined();
    });

    it("ignores when customer is different", async () => {
      const differentCustomerSale: Sale = {
        id: "S-202",
        transactionNumber: "INV-202610-0003",
        customerName: "Pelanggan Lain",
        total: 200000,
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        saleDate: "2026-10-09",
        items: baseInput.items
      };

      mocks.listSalesRecords.mockResolvedValue([differentCustomerSale]);

      const duplicate = await findSemanticDuplicateSale(baseInput);
      expect(duplicate).toBeUndefined();
    });

    it("ignores when item quantities or items differ", async () => {
      const differentItemsSale: Sale = {
        id: "S-203",
        transactionNumber: "INV-202610-0004",
        customerName: "Toko Sinar Jaya",
        total: 200000,
        paymentMethod: "Cash",
        approvalStatus: "approved",
        syncTarget: "local",
        syncStatus: "local",
        stockReleaseStatus: "released",
        erpPaymentStatus: "not_required",
        isTestTransaction: false,
        createdByUserId: "u1",
        createdByNameSnapshot: "Admin",
        createdByRoleSnapshot: "ADMIN",
        createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        saleDate: "2026-10-09",
        items: [
          {
            productRef: "BRG-DIFFERENT",
            quantity: 1,
            unitPrice: 200000,
            discount: 0
          }
        ]
      };

      mocks.listSalesRecords.mockResolvedValue([differentItemsSale]);

      const duplicate = await findSemanticDuplicateSale(baseInput);
      expect(duplicate).toBeUndefined();
    });
  });
});
