import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import {
  getCctvDashboardSummary,
  getCctvAnomaliesReport,
  getCctvCamerasReport,
} from "@/lib/cctv/store";
import { CctvDashboardWidget } from "@/components/dashboard/CctvDashboardWidget";
import { NAV_LINKS, isNavLinkActive } from "@/components/layout/navigation";

describe("DEEP ADVERSARIAL & NO-AI-SLOP VERIFICATION: CCTV DASHBOARD & REPORTS", () => {
  describe("1. Design Quality & NO AI SLOP Verification", () => {
    it("guarantees CctvDashboardWidget contains zero raw tacky emojis", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 25, totalDetections: 120, totalAnomalies: 3 },
            recentPacked: [
              {
                id: "pack-test-1",
                invoiceNumber: "INV-2026-001",
                customerName: "Toko Sinar Jaya",
                cameraName: "Meja 1",
                screenshotPhotoUrl: "https://cctv.test/snap1.jpg",
                createdAt: new Date(),
                salesRecord: {
                  id: "sale-1",
                  transactionNumber: "INV-2026-001",
                  customerName: "Toko Sinar Jaya",
                  total: 500000,
                },
              },
            ],
            liveSystem: {
              status: "online",
              cameras: [{ id: 1, name: "Meja 1", status: "online", fps: 30 }],
            },
          }}
        />
      );

      // Regex matching common emojis using surrogate pairs without ES6 /u flag requirement
      const hasEmoji = (text: string) => /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text) || /[\u2600-\u27BF]/.test(text);
      expect(hasEmoji(html)).toBe(false);

      // Verify clean SVG icons are used instead
      expect(html).toContain("<svg");
      expect(html).toContain("stroke=\"currentColor\"");
      expect(html).toContain("viewBox=\"0 0 24 24\"");
    });

    it("verifies empty state of CctvDashboardWidget contains zero raw emojis and has clean typography", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 0, totalDetections: 0, totalAnomalies: 0 },
            recentPacked: [],
            liveSystem: null,
          }}
        />
      );

      const hasEmoji = (text: string) => /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text) || /[\u2600-\u27BF]/.test(text);
      expect(hasEmoji(html)).toBe(false);
      expect(html).toContain("Belum ada paket yang dipacking hari ini");
      expect(html).toContain("Kamera CCTV standby memantau meja packing gudang");
      expect(html).toContain("<svg");
    });

    it("ensures navigation icons are cohesive and contain zero colorful emojis", () => {
      const cctvReportLink = NAV_LINKS.find((l) => l.href === "/reports/cctv");
      const cctvMonitoringLink = NAV_LINKS.find((l) => l.href === "/cctv-monitoring");

      expect(cctvReportLink).toBeDefined();
      expect(cctvMonitoringLink).toBeDefined();

      const hasEmoji = (text: string) => /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text) || /[\u2600-\u27BF]/.test(text);
      expect(hasEmoji(cctvReportLink!.icon)).toBe(false);
      expect(hasEmoji(cctvMonitoringLink!.icon)).toBe(false);

      // Verify monochrome geometric glyphs matching the rest of the navigation
      expect(cctvReportLink!.icon).toBe("▣");
      expect(cctvMonitoringLink!.icon).toBe("◉");
    });

    it("verifies isNavLinkActive correctly activates /reports/cctv for subpaths and tabs", () => {
      expect(isNavLinkActive("/reports/cctv", "/reports/cctv")).toBe(true);
      expect(isNavLinkActive("/reports/cctv/details", "/reports/cctv")).toBe(true);
      expect(isNavLinkActive("/dashboard", "/reports/cctv")).toBe(false);
    });
  });

  describe("2. CctvDashboardWidget Unhappy Paths & Corrupted States", () => {
    it("handles completely empty / undefined properties without throwing exceptions", () => {
      const corruptSummary: any = {
        today: undefined,
        recentPacked: undefined,
        liveSystem: undefined,
      };

      const html = renderToStaticMarkup(<CctvDashboardWidget summary={corruptSummary} />);
      expect(html).toBeDefined();
      expect(html).toContain("Pengawasan Meja Packing CCTV");
      expect(html).toContain("0"); // totalPacked fallback to 0
      expect(html).toContain("Belum ada paket yang dipacking hari ini");
    });

    it("handles recentPacked items with completely null and undefined values", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 1, totalDetections: 1, totalAnomalies: 0 },
            recentPacked: [
              {
                id: "pack-null-item",
                invoiceNumber: null,
                customerName: null,
                cameraName: null,
                screenshotPhotoUrl: null,
                evidenceUrl: null,
                createdAt: new Date(),
                packingCompletedAt: null,
                salesRecord: null,
              },
            ],
            liveSystem: { status: "unknown", cameras: [] },
          }}
        />
      );

      expect(html).toContain("—"); // Invoice fallback
      expect(html).toContain("Customer Umum"); // Customer fallback
      expect(html).toContain("Meja 1"); // Camera fallback
      expect(html).toContain("<svg"); // Fallback icon instead of image
    });

    it("escapes malicious XSS injection payloads in invoice numbers and customer names", () => {
      const xssString = "<script>alert('pwned')</script>";
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 1, totalDetections: 1, totalAnomalies: 0 },
            recentPacked: [
              {
                id: "pack-xss",
                invoiceNumber: xssString,
                customerName: xssString,
                cameraName: xssString,
                screenshotPhotoUrl: null,
                createdAt: new Date(),
                salesRecord: null,
              },
            ],
            liveSystem: null,
          }}
        />
      );

      expect(html).not.toContain("<script>alert('pwned')</script>");
      expect(html).toContain("&lt;script&gt;alert(&#x27;pwned&#x27;)&lt;/script&gt;");
    });

    it("handles invalid or extreme string lengths in recent items without layout crash", () => {
      const giantString = "X".repeat(5000);
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 1, totalDetections: 1, totalAnomalies: 0 },
            recentPacked: [
              {
                id: "pack-giant",
                invoiceNumber: giantString,
                customerName: giantString,
                cameraName: giantString,
                createdAt: new Date(),
              },
            ],
            liveSystem: null,
          }}
        />
      );

      expect(html).toBeDefined();
      expect(html).toContain("truncate");
    });
  });

  describe("3. Backend Store Resiliency: getCctvDashboardSummary", () => {
    it("returns valid structure even if database has zero CCTV logs", async () => {
      const summary = await getCctvDashboardSummary();

      expect(summary).toBeDefined();
      expect(summary.today).toBeDefined();
      expect(typeof summary.today.totalPacked).toBe("number");
      expect(typeof summary.today.totalDetections).toBe("number");
      expect(typeof summary.today.totalAnomalies).toBe("number");
      expect(Array.isArray(summary.recentPacked)).toBe(true);
      expect(summary.recentPacked.length).toBeLessThanOrEqual(5);
    }, 15000);
  });

  describe("4. Backend Store Resiliency: getCctvAnomaliesReport Unhappy Paths", () => {
    it("handles invalid, impossible, and non-date filter strings gracefully", async () => {
      const corruptedFilters = [
        { from: "nonsense-date", to: "invalid-date" },
        { from: "2026-99-99", to: "2026-00-00" },
        { from: "'; DROP TABLE \"CctvDetectionLog\"; --", to: "2026-12-31" },
      ];

      for (const filter of corruptedFilters) {
        const report = await getCctvAnomaliesReport({
          from: filter.from,
          to: filter.to,
          page: 1,
          pageSize: 10,
        });

        expect(report).toBeDefined();
        expect(Array.isArray(report.items)).toBe(true);
        expect(typeof report.total).toBe("number");
        expect(report.totalPages).toBeGreaterThanOrEqual(1);
      }
    });

    it("clamps extreme pagination inputs (negative, zero, massive numbers)", async () => {
      const testCases = [
        { page: -10, pageSize: -100, expectedPage: 1, expectedPageSize: 5 },
        { page: 0, pageSize: 0, expectedPage: 1, expectedPageSize: 20 },
        { page: 999999, pageSize: 10000, expectedPage: 999999, expectedPageSize: 100 },
      ];

      for (const tc of testCases) {
        const report = await getCctvAnomaliesReport({
          page: tc.page,
          pageSize: tc.pageSize,
        });

        expect(report.page).toBe(tc.expectedPage);
        expect(report.pageSize).toBe(tc.expectedPageSize);
      }
    });

    it("handles SQL injection and regex payloads in search and cameraName without throwing", async () => {
      const adversarialInputs = [
        "1' OR '1'='1",
        "'; DELETE FROM \"CctvDetectionLog\"; --",
        "<script>alert(1)</script>",
        ".*+?^${}()|[]\\",
      ];

      for (const input of adversarialInputs) {
        const report = await getCctvAnomaliesReport({
          search: input,
          cameraName: input,
          page: 1,
          pageSize: 10,
        });

        expect(report).toBeDefined();
        expect(Array.isArray(report.items)).toBe(true);
        expect(typeof report.total).toBe("number");
      }
    });
  });

  describe("5. Backend Store Resiliency: getCctvCamerasReport", () => {
    it("handles camera report safely when grouping empty or non-empty logs", async () => {
      const report = await getCctvCamerasReport();

      expect(report).toBeDefined();
      expect(Array.isArray(report.cameras)).toBe(true);

      for (const cam of report.cameras) {
        expect(typeof cam.name).toBe("string");
        expect(typeof cam.totalAllTime).toBe("number");
        expect(typeof cam.totalToday).toBe("number");
        expect(typeof cam.isOnline).toBe("boolean");
      }
    });
  });
});
