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
import { NAV_LINKS } from "@/components/layout/navigation";

describe("CCTV Dashboard Widget & Multi-Tab Report Integration", () => {
  describe("1. CctvDashboardWidget Component Rendering & Edge States", () => {
    it("renders empty state gracefully when there are 0 packed packages today", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 0, totalDetections: 0, totalAnomalies: 0 },
            recentPacked: [],
            liveSystem: { status: "standby", cameras: [] },
          }}
        />
      );

      expect(html).toContain("Pengawasan Meja Packing CCTV");
      expect(html).toContain("Hari Ini");
      expect(html).toContain("Belum ada paket yang dipacking hari ini");
      expect(html).toContain("Standby");
      expect(html).toContain("Nihil anomali");
    });

    it("renders active KPI cards and recent packed packages feed with photo preview", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 12, totalDetections: 45, totalAnomalies: 2 },
            recentPacked: [
              {
                id: "pack-1",
                invoiceNumber: "INV-2026-999",
                customerName: "Toko Grosir Mandiri",
                cameraName: "Meja Packing Utama",
                screenshotPhotoUrl: "https://cctv.test/snap-1.jpg",
                createdAt: new Date(),
                salesRecord: {
                  id: "sale-1",
                  transactionNumber: "INV-2026-999",
                  customerName: "Toko Grosir Mandiri",
                  total: 350000,
                },
              },
            ],
            liveSystem: {
              status: "online",
              cameras: [{ id: 1, name: "Meja Packing Utama", status: "online", fps: 25 }],
            },
          }}
        />
      );

      expect(html).toContain("12"); // Total packed
      expect(html).toContain("45"); // Total detections
      expect(html).toContain("2"); // Total anomalies
      expect(html).toContain("Perlu ditinjau");
      expect(html).toContain("Online");
      expect(html).toContain("INV-2026-999");
      expect(html).toContain("Toko Grosir Mandiri");
      expect(html).toContain("Meja Packing Utama");
      expect(html).toContain("https://cctv.test/snap-1.jpg");
    });
  });

  describe("2. Backend Store: getCctvDashboardSummary, getCctvAnomaliesReport, getCctvCamerasReport", () => {
    it("getCctvDashboardSummary returns accurate counts and recent items", async () => {
      const summary = await getCctvDashboardSummary();

      expect(summary).toBeDefined();
      expect(summary.today).toBeDefined();
      expect(typeof summary.today.totalPacked).toBe("number");
      expect(typeof summary.today.totalDetections).toBe("number");
      expect(typeof summary.today.totalAnomalies).toBe("number");
      expect(Array.isArray(summary.recentPacked)).toBe(true);
      expect(summary.recentPacked.length).toBeLessThanOrEqual(5);
    });

    it("getCctvAnomaliesReport filters anomalies and review records", async () => {
      // Create a test anomaly record
      const testAnomaly = await prisma.cctvDetectionLog.create({
        data: {
          invoiceNumber: `UNMATCHED-${Date.now()}`,
          customerName: "Resi Tidak Dikenal",
          cameraName: "Meja Packing Anomali",
          eventType: "anomaly",
          matchStatus: "unmatched",
          notes: "Teks resi tidak terdaftar di sistem SLM",
        },
      });

      try {
        const report = await getCctvAnomaliesReport({
          search: testAnomaly.invoiceNumber!,
          page: 1,
          pageSize: 10,
        });

        expect(report.total).toBeGreaterThanOrEqual(1);
        expect(report.items.some((i) => i.id === testAnomaly.id)).toBe(true);
        expect(report.items[0].matchStatus).toBe("unmatched");
      } finally {
        await prisma.cctvDetectionLog.delete({ where: { id: testAnomaly.id } }).catch(() => {});
      }
    });

    it("getCctvCamerasReport groups cameras and computes productivity counts", async () => {
      const cameraReport = await getCctvCamerasReport();

      expect(cameraReport).toBeDefined();
      expect(Array.isArray(cameraReport.cameras)).toBe(true);
      for (const cam of cameraReport.cameras) {
        expect(typeof cam.name).toBe("string");
        expect(typeof cam.totalAllTime).toBe("number");
        expect(typeof cam.totalToday).toBe("number");
        expect(typeof cam.isOnline).toBe("boolean");
      }
    });
  });

  describe("3. Navigation & Route Alignment", () => {
    it("registers 'Laporan Pengawasan CCTV' pointing to /reports/cctv under PUSAT LAPORAN", () => {
      const cctvLink = NAV_LINKS.find((link) => link.href === "/reports/cctv");

      expect(cctvLink).toBeDefined();
      expect(cctvLink?.label).toBe("Laporan Pengawasan CCTV");
      expect(cctvLink?.category).toBe("PUSAT LAPORAN");
      expect(cctvLink?.permission).toBe("reports.view");
    });
  });
});
