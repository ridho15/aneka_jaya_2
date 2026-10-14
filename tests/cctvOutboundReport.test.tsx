import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { getCctvOutboundReport, listCctvCameraNames } from "@/lib/cctv/store";
import { CctvPackingWidget } from "@/components/cctv/CctvPackingWidget";

describe("CCTV Outbound Report & Verification Widget (Step 4 & 5)", () => {
  it("should generate outbound report with SKU breakdown and KPI summary", async () => {
    // 1. Buat dummy sales record dengan items untuk relasi
    const testSale = await prisma.salesRecord.create({
      data: {
        id: `test-sale-${Date.now()}`,
        saleDate: new Date(),
        customerName: "Toko Grosir Bukittinggi",
        tipeId: "W",
        tipeCodeSnapshot: "W",
        tipeNameSnapshot: "Grosir W",
        approvalStatus: "approved",
        paymentMethod: "Cash",
        total: 500000,
        transactionNumber: `INV-CCTV-${Date.now()}`,
        transactionDateKey: `20261013-${Date.now()}`,
        transactionSequence: Math.floor(Math.random() * 100000),
        doPackingStatus: "sudah",
        createdByUserId: "usr-test-cctv",
        createdByNameSnapshot: "Admin Test",
        createdByRoleSnapshot: "OWNER",
        createdAt: new Date(),
        items: {
          create: [
            {
              id: `item-1-${Date.now()}`,
              productRef: "SKU-AKSESORIS-01",
              quantity: 10,
              unitPrice: 25000,
              discount: 0,
              sortOrder: 1,
              unitSnapshot: "PCS",
            },
            {
              id: `item-2-${Date.now()}`,
              productRef: "SKU-AKSESORIS-02",
              quantity: 5,
              unitPrice: 50000,
              discount: 0,
              sortOrder: 2,
              unitSnapshot: "LUSIN",
            },
          ],
        },
      },
      include: { items: true },
    });

    // 2. Buat log deteksi CCTV terkait
    const testLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: testSale.transactionNumber,
        customerName: testSale.customerName,
        salesRecordId: testSale.id,
        cameraName: "Kamera Meja Packing A1",
        sourceLabel: "Gudang Aneka Jaya",
        eventType: "packing_completed",
        packingStatus: "completed",
        matchStatus: "matched",
        screenshotPhotoUrl: "https://cctv.test/snapshot-packing-a1.jpg",
        packingCompletedAt: new Date(),
        notes: "Paket lengkap 15 pcs aksesoris siap kirim",
      },
    });

    try {
      // 3. Panggil getCctvOutboundReport
      const report = await getCctvOutboundReport({
        search: testSale.transactionNumber!,
        page: 1,
        pageSize: 10,
      });

      expect(report.total).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalOutboundPackages).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalSkusDispatched).toBeGreaterThanOrEqual(15);
      expect(report.summary.topCamera).toBe("Kamera Meja Packing A1");

      const foundItem = report.items.find((i) => i.id === testLog.id);
      expect(foundItem).toBeDefined();
      expect(foundItem?.salesRecord).toBeDefined();
      expect(foundItem?.salesRecord?.items.length).toBe(2);
      expect(foundItem?.screenshotPhotoUrl).toBe("https://cctv.test/snapshot-packing-a1.jpg");

      // 4. Test filter kamera spesifik
      const filteredByCam = await getCctvOutboundReport({
        cameraName: "Kamera Meja Packing A1",
        search: testSale.transactionNumber!,
      });
      expect(filteredByCam.items.length).toBe(1);

      // 5. Test filter kamera yang tidak cocok
      const filteredByNonExistentCam = await getCctvOutboundReport({
        cameraName: "Kamera Meja Antartika",
        search: testSale.transactionNumber!,
      });
      expect(filteredByNonExistentCam.items.length).toBe(0);

      // 6. Test listCctvCameraNames
      const cameras = await listCctvCameraNames();
      expect(cameras).toContain("Kamera Meja Packing A1");
    } finally {
      // Clean up
      await prisma.cctvDetectionLog.delete({ where: { id: testLog.id } }).catch(() => {});
      await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: testSale.id } }).catch(() => {});
      await prisma.salesRecord.delete({ where: { id: testSale.id } }).catch(() => {});
    }
  }, 20000);

  it("handles empty results and unlinked sales gracefully", async () => {
    const emptyReport = await getCctvOutboundReport({
      search: "NON_EXISTENT_SEARCH_KEYWORD_XYZ_9999",
      page: 1,
      pageSize: 10,
    });

    expect(emptyReport.total).toBe(0);
    expect(emptyReport.items.length).toBe(0);
    expect(emptyReport.summary.totalOutboundPackages).toBe(0);
    expect(emptyReport.summary.totalSkusDispatched).toBe(0);
    expect(emptyReport.summary.topCamera).toBe("—");
  }, 10000);

  it("renders CctvPackingWidget with 'Terdeteksi CCTV: Ya' when detection exists", () => {
    const html = renderToStaticMarkup(
      <CctvPackingWidget
        detection={{
          invoiceNumber: "INV-2026-001",
          customerName: "Toko Berkah",
          cameraName: "Meja 1",
          packingStatus: "completed",
          screenshotPhotoUrl: "https://cctv.test/photo.jpg",
        }}
      />
    );

    expect(html).toContain("Terdeteksi CCTV: Ya");
    expect(html).toContain("Verifikasi Meja Packing CCTV");
    expect(html).toContain("Meja 1");
    expect(html).toContain("https://cctv.test/photo.jpg");
    expect(html).toContain("Perbesar Foto");
  });

  it("renders CctvPackingWidget with 'Terdeteksi CCTV: Tidak' when detection is absent", () => {
    const html = renderToStaticMarkup(
      <CctvPackingWidget detection={null} fallbackReceiptPhoto={null} />
    );

    expect(html).toContain("Terdeteksi CCTV: Tidak");
    expect(html).toContain("Belum Terdeteksi CCTV Meja Packing");
    expect(html).toContain("Menunggu Sinyal CCTV");
  });
});
