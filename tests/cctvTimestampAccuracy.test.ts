import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn().mockResolvedValue("OWNER"),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "admin-1", role: "OWNER" }),
}));

// Mock Prisma
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockGroupBy = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    cctvDetectionLog: {
      findMany: (...args: any[]) => mockFindMany(...args),
      count: (...args: any[]) => mockCount(...args),
      groupBy: (...args: any[]) => mockGroupBy(...args),
      findFirst: (...args: any[]) => mockFindFirst(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    salesRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    deliveryOrder: {
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import {
  parseDateFilterRange,
  getPackingDateCondition,
  getActivityDateCondition,
  getCctvDashboardSummary,
  getCctvOutboundReport,
  getCctvStats,
} from "@/lib/cctv/store";
import { fetchSnapshotCaptureDate } from "@/lib/cctv/client";
import { POST as postCctvEvent } from "@/app/api/cctv/events/route";

describe("CCTV Physical Timestamp Accuracy & Date Filtering Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Date Range & Condition Helpers", () => {
    it("returns null when no from/to filter is provided", () => {
      expect(parseDateFilterRange()).toBeNull();
      expect(parseDateFilterRange(undefined, undefined)).toBeNull();
    });

    it("correctly parses from and to dates in WIB (+07:00)", () => {
      const range = parseDateFilterRange("2026-10-14", "2026-10-14");
      expect(range).not.toBeNull();
      expect(range?.gte?.toISOString()).toBe("2026-10-13T17:00:00.000Z"); // 00:00 WIB
      expect(range?.lte?.toISOString()).toBe("2026-10-14T16:59:59.000Z"); // 23:59:59 WIB
    });

    it("creates packing condition prioritizing packingCompletedAt with fallback to createdAt", () => {
      const range = { gte: new Date("2026-10-14T00:00:00Z"), lte: new Date("2026-10-14T23:59:59Z") };
      const condition = getPackingDateCondition(range);

      expect(condition).toEqual({
        OR: [
          { packingCompletedAt: range },
          { packingCompletedAt: null, createdAt: range },
        ],
      });
    });

    it("creates activity condition checking packingCompletedAt, firstSeenAt, and createdAt", () => {
      const range = { gte: new Date("2026-10-14T00:00:00Z"), lte: new Date("2026-10-14T23:59:59Z") };
      const condition = getActivityDateCondition(range);

      expect(condition).toEqual({
        OR: [
          { packingCompletedAt: range },
          { firstSeenAt: range },
          { packingCompletedAt: null, firstSeenAt: null, createdAt: range },
        ],
      });
    });
  });

  describe("2. getCctvDashboardSummary & getCctvOutboundReport Queries", () => {
    it("getCctvDashboardSummary queries totalPackedToday using packingCompletedAt condition", async () => {
      mockCount.mockResolvedValue(0);
      mockFindMany.mockResolvedValue([]);

      await getCctvDashboardSummary();

      // Check first call to count (totalPackedToday)
      expect(mockCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: "packing_completed",
            OR: expect.arrayContaining([
              expect.objectContaining({ packingCompletedAt: expect.any(Object) }),
              expect.objectContaining({ packingCompletedAt: null, createdAt: expect.any(Object) }),
            ]),
          }),
        })
      );

      // Check recentPacked order
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventType: "packing_completed" },
          orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
          take: 5,
        })
      );
    });

    it("getCctvOutboundReport filters by packingCompletedAt and orders by physical packing date", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await getCctvOutboundReport({
        from: "2026-10-14",
        to: "2026-10-14",
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: "packing_completed",
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ packingCompletedAt: expect.any(Object) }),
                  expect.objectContaining({ packingCompletedAt: null, createdAt: expect.any(Object) }),
                ]),
              }),
            ]),
          }),
          orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
        })
      );
    });
  });

  describe("3. fetchSnapshotCaptureDate & Physical Image Header Resolution", () => {
    it("extracts Last-Modified header from evidence URL HEAD request", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          "last-modified": "Wed, 14 Oct 2026 04:23:52 GMT",
        }),
      });
      global.fetch = mockFetch;

      const snapshotDate = await fetchSnapshotCaptureDate(
        "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/34"
      );

      expect(snapshotDate).not.toBeNull();
      expect(snapshotDate?.toISOString()).toBe("2026-10-14T04:23:52.000Z");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/slm/evidence/label-snapshot/34"),
        expect.objectContaining({ method: "HEAD" })
      );
    });

    it("returns null gracefully if network or server error occurs during HEAD check", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const snapshotDate = await fetchSnapshotCaptureDate(
        "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/999"
      );
      expect(snapshotDate).toBeNull();
    });
  });

  describe("4. Webhook /api/cctv/events Physical Timestamp Ingestion", () => {
    it("uses physical snapshot capture date even if CCTV sends occurred_at from 2 days later", async () => {
      // Mock HEAD response to return 14 Oct 2026
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          "last-modified": "Wed, 14 Oct 2026 04:23:52 GMT",
        }),
      });

      const payload = {
        event_id: "cctv_pack_34",
        event_type: "packing_completed",
        occurred_at: "2026-10-16T03:05:07+00:00", // Delayed queue sent on 16 Oct
        evidence_url: "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/34",
        camera: { id: 1, name: "Camera 14" },
        data: {
          label_id: 34,
          invoice_number: "INV-141026-01",
          customer_name: "Customer A",
        },
      };

      const req = new Request("http://localhost:3000/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cctv-token": "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
        },
        body: JSON.stringify(payload),
      });

      const response = await postCctvEvent(req);
      expect(response.status).toBe(200);

      // Verify that CctvDetectionLog.create was called with packingCompletedAt matching 14 Oct 2026
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cctvLabelId: 34,
            invoiceNumber: "INV-141026-01",
            packingCompletedAt: new Date("2026-10-14T04:23:52.000Z"),
            firstSeenAt: new Date("2026-10-14T04:23:52.000Z"),
          }),
        })
      );
    });
  });
});
