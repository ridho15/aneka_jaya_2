import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/db/prisma";
import { listCctvDetectionsPaginated, getCctvStats, getCctvDetectionForSales } from "@/lib/cctv/store";

describe("CCTV Monitoring Store (lib/cctv/store.ts)", () => {
  it("should create and query CCTV detection log", async () => {
    const testLog = await prisma.cctvDetectionLog.create({
      data: {
        invoiceNumber: "TEST-INV-9999",
        customerName: "Toko Uji Coba CCTV",
        cameraName: "Meja Packing 1",
        eventType: "packing_completed",
        packingStatus: "completed",
        matchStatus: "matched",
        notes: "Test log entry",
      },
    });

    expect(testLog.id).toBeDefined();

    const list = await listCctvDetectionsPaginated({
      search: "TEST-INV-9999",
      page: 1,
      pageSize: 10,
    });

    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.items[0].invoiceNumber).toBe("TEST-INV-9999");

    const found = await getCctvDetectionForSales("", "TEST-INV-9999");
    expect(found).not.toBeNull();
    expect(found?.customerName).toBe("Toko Uji Coba CCTV");

    // Clean up
    await prisma.cctvDetectionLog.delete({ where: { id: testLog.id } });
  }, 15000);

  it("should retrieve CCTV stats", async () => {
    const stats = await getCctvStats();
    expect(stats.today).toBeDefined();
    expect(typeof stats.today.totalDetections).toBe("number");
    expect(typeof stats.today.totalPacked).toBe("number");
  }, 15000);
});
