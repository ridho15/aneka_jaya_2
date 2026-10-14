import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { getCctvOutboundReport, listCctvCameraNames } from "@/lib/cctv/store";
import { filterSalesRecordsInMemory, buildSalesWhere } from "@/lib/sales/store";
import { CctvPackingWidget } from "@/components/cctv/CctvPackingWidget";
import { can, ROLES, type Role } from "@/lib/auth/roles";
import { getCctvInvoiceStatus, getCctvSystemStatus } from "@/lib/cctv/client";
import type { Sale } from "@/lib/types/sales";

describe("CCTV DEEP VERIFICATION - UNHAPPY PATH & ADVERSARIAL TESTING", () => {
  describe("1. Outbound Report Query & Aggregation Resiliency (lib/cctv/store.ts)", () => {
    it("handles corrupted, invalid, and impossible dates without throwing", async () => {
      const corruptedDates = [
        { from: "invalid-date", to: "not-a-date" },
        { from: "9999-99-99", to: "0000-00-00" },
        { from: "2026-02-31", to: "2026-13-45" }, // tanggal tidak ada di kalender
        { from: "2026-12-31", to: "2026-01-01" }, // from lebih besar dari to
        { from: "'; DROP TABLE sales_records; --", to: "' OR '1'='1" }, // SQL Injection in date
      ];

      for (const d of corruptedDates) {
        const res = await getCctvOutboundReport({
          from: d.from,
          to: d.to,
          page: 1,
          pageSize: 10,
        });

        expect(res).toBeDefined();
        expect(Array.isArray(res.items)).toBe(true);
        expect(typeof res.total).toBe("number");
        expect(res.totalPages).toBeGreaterThanOrEqual(1);
        expect(res.summary).toBeDefined();
        expect(typeof res.summary.totalSkusDispatched).toBe("number");
        expect(Number.isNaN(res.summary.totalSkusDispatched)).toBe(false);
      }
    });

    it("enforces strict boundary limits on negative, zero, and huge pagination inputs", async () => {
      const testCases = [
        { page: -5, pageSize: -20, expectedPage: 1, expectedPageSize: 5 },
        { page: 0, pageSize: 0, expectedPage: 1, expectedPageSize: 20 }, // 0 defaults to 20
        { page: 999999, pageSize: 50000, expectedPage: 999999, expectedPageSize: 100 },
      ];

      for (const tc of testCases) {
        const res = await getCctvOutboundReport({
          page: tc.page,
          pageSize: tc.pageSize,
        });

        expect(res.page).toBe(tc.expectedPage);
        expect(res.pageSize).toBe(tc.expectedPageSize);
      }
    });

    it("handles SQL injection, XSS payloads, and regex special characters in search parameters", async () => {
      const adversarialSearchStrings = [
        "'; DROP TABLE \"CctvDetectionLog\"; --",
        "1' OR '1'='1",
        "<script>alert('xss')</script>",
        "../../../../etc/passwd",
        "${7*7}",
        "{{7*7}}",
        "\\x00\\x1f\\x7f", // control chars & null byte
        ".*+?^${}()|[]\\", // regex bomb characters
      ];

      for (const search of adversarialSearchStrings) {
        const res = await getCctvOutboundReport({
          search,
          cameraName: search,
          sourceLabel: search,
          page: 1,
          pageSize: 10,
        });

        expect(res).toBeDefined();
        expect(Array.isArray(res.items)).toBe(true);
        expect(typeof res.total).toBe("number");
        expect(Number.isNaN(res.summary.totalSkusDispatched)).toBe(false);
      }
    });

    it("calculates summary correctly even when CCTV log has orphaned salesRecord or missing items", async () => {
      const orphanedLog = await prisma.cctvDetectionLog.create({
        data: {
          invoiceNumber: `ORPHAN-${Date.now()}`,
          customerName: "Customer Tanpa Sales Record",
          cameraName: "Kamera Meja Orphan",
          eventType: "packing_completed",
          packingStatus: "completed",
          matchStatus: "unmatched",
          salesRecordId: null,
          notes: "Orphaned test log",
        },
      });

      try {
        const res = await getCctvOutboundReport({
          search: orphanedLog.invoiceNumber!,
          page: 1,
          pageSize: 10,
        });

        expect(res.items.length).toBe(1);
        expect(res.items[0].salesRecord).toBeNull();
        expect(res.summary.totalOutboundPackages).toBe(1);
        expect(res.summary.totalSkusDispatched).toBe(0);
        expect(res.summary.topCamera).toBe("Kamera Meja Orphan");
      } finally {
        await prisma.cctvDetectionLog.delete({ where: { id: orphanedLog.id } }).catch(() => {});
      }
    });

    it("handles salesRecord with items having null, zero, or decimal quantities safely", async () => {
      const testSale = await prisma.salesRecord.create({
        data: {
          id: `adversarial-sale-${Date.now()}`,
          saleDate: new Date(),
          customerName: "Toko Adversarial",
          tipeId: "W",
          tipeCodeSnapshot: "W",
          tipeNameSnapshot: "Grosir W",
          approvalStatus: "approved",
          paymentMethod: "Cash",
          total: 100000,
          transactionNumber: `INV-ADV-${Date.now()}`,
          transactionDateKey: `20261013-${Date.now()}`,
          transactionSequence: Math.floor(Math.random() * 100000),
          doPackingStatus: "sudah",
          createdByUserId: "usr-adversarial",
          createdByNameSnapshot: "User Test",
          createdByRoleSnapshot: "OWNER",
          createdAt: new Date(),
          items: {
            create: [
              {
                id: `adv-item-1-${Date.now()}`,
                productRef: "SKU-ADV-1",
                quantity: 0,
                unitPrice: 10000,
                discount: 0,
                sortOrder: 1,
              },
              {
                id: `adv-item-2-${Date.now()}`,
                productRef: "SKU-ADV-2",
                quantity: 12.5,
                unitPrice: 10000,
                discount: 0,
                sortOrder: 2,
              },
            ],
          },
        },
        include: { items: true },
      });

      const testLog = await prisma.cctvDetectionLog.create({
        data: {
          invoiceNumber: testSale.transactionNumber,
          customerName: testSale.customerName,
          salesRecordId: testSale.id,
          cameraName: "Kamera Pecahan",
          eventType: "packing_completed",
          packingStatus: "completed",
        },
      });

      try {
        const res = await getCctvOutboundReport({
          search: testSale.transactionNumber!,
        });

        expect(res.items.length).toBe(1);
        expect(res.summary.totalSkusDispatched).toBe(12.5);
      } finally {
        await prisma.cctvDetectionLog.delete({ where: { id: testLog.id } }).catch(() => {});
        await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: testSale.id } }).catch(() => {});
        await prisma.salesRecord.delete({ where: { id: testSale.id } }).catch(() => {});
      }
    }, 25000);
  });

  describe("2. Sales History Filter & Where Builder Unhappy Paths (lib/sales/store.ts)", () => {
    const dummySales: Sale[] = [
      {
        id: "s1",
        saleDate: "2026-10-13",
        customerName: "Toko A",
        paymentMethod: "Cash",
        total: 10000,
        items: [],
        doPackingStatus: "sudah",
      },
      {
        id: "s2",
        saleDate: "2026-10-13",
        customerName: "Toko B",
        paymentMethod: "Cash",
        total: 20000,
        items: [],
        doPackingStatus: "belum",
      },
      {
        id: "s3",
        saleDate: "2026-10-13",
        customerName: "Toko C",
        paymentMethod: "Cash",
        total: 30000,
        items: [],
        doPackingStatus: undefined,
      },
      {
        id: "s4",
        saleDate: "2026-10-13",
        customerName: "Toko D",
        paymentMethod: "Cash",
        total: 40000,
        items: [],
      },
    ];

    it("filters cctvStatus='ya' strictly to doPackingStatus === 'sudah'", () => {
      const filtered = filterSalesRecordsInMemory(dummySales, { cctvStatus: "ya" });
      expect(filtered.map((s) => s.id)).toEqual(["s1"]);
    });

    it("filters cctvStatus='tidak' to any record where doPackingStatus !== 'sudah'", () => {
      const filtered = filterSalesRecordsInMemory(dummySales, { cctvStatus: "tidak" });
      expect(filtered.map((s) => s.id)).toEqual(["s2", "s3", "s4"]);
    });

    it("handles invalid, empty, or unknown cctvStatus values gracefully as 'all'", () => {
      const invalidValues = ["unknown", "hack", "", "ALL", "null", "undefined", "123"];
      for (const val of invalidValues) {
        const filtered = filterSalesRecordsInMemory(dummySales, { cctvStatus: val });
        expect(filtered.length).toBe(dummySales.length);
      }
    });

    it("builds correct Prisma where clauses for cctvStatus values", () => {
      const whereYa = buildSalesWhere({ cctvStatus: "ya" });
      expect(whereYa.doPackingStatus).toBe("sudah");

      const whereTidak = buildSalesWhere({ cctvStatus: "tidak" });
      expect(whereTidak.doPackingStatus).toEqual({ not: "sudah" });

      const whereAll = buildSalesWhere({ cctvStatus: "all" });
      expect(whereAll.doPackingStatus).toBeUndefined();

      const whereInvalid = buildSalesWhere({ cctvStatus: "random_injection" });
      expect(whereInvalid.doPackingStatus).toBeUndefined();
    });
  });

  describe("3. CctvPackingWidget UI Component Unhappy Paths (components/cctv/CctvPackingWidget.tsx)", () => {
    it("renders gracefully when detection object is an empty object {}", () => {
      const html = renderToStaticMarkup(<CctvPackingWidget detection={{} as any} />);
      expect(html).toContain("Verifikasi Meja Packing CCTV");
      expect(html).toContain("Terdeteksi CCTV: Tidak");
      expect(html).toContain("Belum Terdeteksi CCTV Meja Packing");
    });

    it("escapes malicious XSS payloads in customerName and cameraName", () => {
      const xssPayload = "<script>alert('XSS_ATTACK')</script><img src=x onerror=alert(1)>";
      const html = renderToStaticMarkup(
        <CctvPackingWidget
          detection={{
            customerName: xssPayload,
            cameraName: xssPayload,
            invoiceNumber: xssPayload,
          }}
        />
      );

      expect(html).not.toContain("<script>alert('XSS_ATTACK')</script>");
      expect(html).toContain("&lt;script&gt;alert(&#x27;XSS_ATTACK&#x27;)&lt;/script&gt;");
    });

    it("handles extreme length strings without crashing", () => {
      const superLongName = "A".repeat(2000);
      const superLongInv = "INV-" + "9".repeat(1000);

      const html = renderToStaticMarkup(
        <CctvPackingWidget
          detection={{
            customerName: superLongName,
            invoiceNumber: superLongInv,
            cameraName: superLongName,
          }}
        />
      );

      expect(html).toBeDefined();
      expect(html).toContain("Terdeteksi CCTV: Ya");
    });

    it("handles null detection honestly without falsely claiming CCTV detection on manual receipt photos", () => {
      const multiPhotos = "https://test.com/photo1.jpg, https://test.com/photo2.jpg";
      const html = renderToStaticMarkup(
        <CctvPackingWidget detection={null} fallbackReceiptPhoto={multiPhotos} />
      );

      expect(html).toContain("Terdeteksi CCTV: Tidak");
      expect(html).toContain("Belum Terdeteksi CCTV Meja Packing");
    });
  });

  describe("4. RBAC Permission Guards for CCTV Outbound Report & Monitoring", () => {
    it("validates reports.view permission: ONLY OWNER has reports.view access", () => {
      // In SLM security architecture:
      expect(can("OWNER", "reports.view")).toBe(true);

      // All other roles are strictly prohibited from viewing reports:
      const nonOwnerRoles: Role[] = ["SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "DELIVERY_DRIVER", "VIEWER"];
      for (const role of nonOwnerRoles) {
        expect(can(role, "reports.view")).toBe(false);
      }
    });

    it("validates audit.view permission for CCTV monitoring across all roles", () => {
      expect(can("OWNER", "audit.view")).toBe(true);
      expect(can("MANAGER", "audit.view")).toBe(true);
      expect(can("ADMIN", "audit.view")).toBe(false);
      expect(can("KASIR" as Role, "audit.view")).toBe(false);
      expect(can("DELIVERY_DRIVER", "audit.view")).toBe(false);
    });
  });

  describe("5. Live CCTV Server Resilience & Timeout Handling", () => {
    it("gracefully returns null without unhandled exceptions on invalid invoice lookup", async () => {
      const result = await getCctvInvoiceStatus("INV-DEFINITELY-DOES-NOT-EXIST-99999");
      expect(result === null || typeof result === "object").toBe(true);
    });

    it("handles system status query gracefully", async () => {
      const status = await getCctvSystemStatus();
      expect(status === null || typeof status === "object").toBe(true);
    });
  });
});
