import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindFirst = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    cctvDetectionLog: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}));

import { getCctvDetectionForSales } from "@/lib/cctv/store";
import {
  sanitizeReceiptPhotoUrl,
  parseReceiptPhotos,
} from "@/lib/deliveryOrders/photos";

describe("CCTV Transaction Detail Matching & Image Proxy Sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. getCctvDetectionForSales Strict Hierarchical Matching", () => {
    it("prioritizes salesRecordId matching directly", async () => {
      const mockRecord = {
        id: "log-1",
        salesRecordId: "sale-123",
        invoiceNumber: "INV-2026-001",
        evidenceUrl: "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/32?token=secret",
        screenshotPhotoUrl: "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/32?token=secret",
        cameraName: "Camera 14",
        packingStatus: "completed",
        cctvLabelId: 32,
      };

      mockFindFirst.mockResolvedValue(mockRecord);

      const result = await getCctvDetectionForSales("sale-123", "INV-999-OTHER");

      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { salesRecordId: "sale-123" },
          orderBy: [{ packingCompletedAt: "desc" }, { createdAt: "desc" }],
        })
      );

      // Verify that URLs are proxied
      expect(result?.evidenceUrl).toContain("/api/cctv/evidence?url=");
      expect(result?.screenshotPhotoUrl).toContain("/api/cctv/evidence?url=");
      expect(result?.evidenceUrl).not.toContain("http://31.97.51.194:8000");
    });

    it("falls back to invoiceNumber only when salesRecordId search yields null and invoice length >= 3", async () => {
      // First call (salesRecordId search) returns null
      // Second call (invoiceNumber fallback) returns record
      const fallbackRecord = {
        id: "log-2",
        salesRecordId: null,
        invoiceNumber: "INV-2026-999",
        slmReference: null,
        evidenceUrl: "http://localhost:8000/labels/16",
        screenshotPhotoUrl: null,
        cctvLabelId: 16,
      };

      mockFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fallbackRecord);

      const result = await getCctvDetectionForSales("sale-not-linked", "INV-2026-999");

      expect(mockFindFirst).toHaveBeenCalledTimes(2);
      expect(mockFindFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            OR: [
              { invoiceNumber: "INV-2026-999" },
              { slmReference: "INV-2026-999" },
            ],
            matchStatus: { in: ["matched", "review"] },
          },
        })
      );

      expect(result?.id).toBe("log-2");
      expect(result?.evidenceUrl).toContain("/api/cctv/evidence?url=");
    });

    it("refuses to fall back to generic short invoice numbers (< 3 chars) to prevent false matches", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await getCctvDetectionForSales("sale-not-found", "01");

      // Only 1 call for salesRecordId, second call skipped because "01".length < 3
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it("returns null if both salesRecordId and invoiceNumber are absent", async () => {
      const result = await getCctvDetectionForSales("", undefined);
      expect(result).toBeNull();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("2. sanitizeReceiptPhotoUrl & parseReceiptPhotos", () => {
    it("converts direct CCTV VPS URL into internal HTTPS proxy URL", () => {
      const rawUrl = "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/32?token=abc";
      const sanitized = sanitizeReceiptPhotoUrl(rawUrl);

      expect(sanitized).toBe(
        `/api/cctv/evidence?url=${encodeURIComponent(rawUrl)}`
      );
    });

    it("converts relative /labels/ URL into internal HTTPS proxy URL", () => {
      const rawUrl = "/labels/34";
      const sanitized = sanitizeReceiptPhotoUrl(rawUrl);

      expect(sanitized).toBe(`/api/cctv/evidence?url=${encodeURIComponent(rawUrl)}`);
    });

    it("preserves standard local /uploads/ and HTTPS cloud URLs unchanged", () => {
      const localUrl = "/uploads/receipts/cctv-pack-123.jpg";
      const cloudUrl = "https://storage.googleapis.com/bucket/photo.jpg";

      expect(sanitizeReceiptPhotoUrl(localUrl)).toBe(localUrl);
      expect(sanitizeReceiptPhotoUrl(cloudUrl)).toBe(cloudUrl);
    });

    it("parseReceiptPhotos automatically sanitizes CCTV VPS URLs in single or JSON array formats", () => {
      const rawVpsUrl = "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/32";
      const localUrl = "/uploads/receipts/proof.jpg";

      // Test single URL
      const singleParsed = parseReceiptPhotos(rawVpsUrl);
      expect(singleParsed).toHaveLength(1);
      expect(singleParsed[0]).toContain("/api/cctv/evidence?url=");

      // Test JSON array
      const jsonArr = JSON.stringify([rawVpsUrl, localUrl]);
      const multiParsed = parseReceiptPhotos(jsonArr);
      expect(multiParsed).toHaveLength(2);
      expect(multiParsed[0]).toContain("/api/cctv/evidence?url=");
      expect(multiParsed[1]).toBe(localUrl);
    });
  });
});
