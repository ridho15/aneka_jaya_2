import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { POST as lookupPost } from "@/app/api/cctv/labels/lookup/route";
import { POST as syncPost } from "@/app/api/cctv/labels/sync/route";
import { prisma } from "@/lib/db/prisma";

const TOKEN = process.env.CCTV_INTEGRATION_TOKEN || "cctv-slm-token-2026";

describe("CCTV Integration Routes", () => {
  let sampleSales: any;

  beforeAll(async () => {
    sampleSales = await prisma.salesRecord.findFirst({
      include: { deliveryOrder: true }
    });
  });

  describe("POST /api/cctv/labels/lookup", () => {
    it("should return 401 without Bearer token", async () => {
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: "061026-23" })
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(401);
    });

    it("should return 401 when Bearer token is wrong or header is malformed", async () => {
      const wrongReq = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer WRONG_TOKEN_123"
        },
        body: JSON.stringify({ invoice_number: "061026-23" })
      });
      const wrongRes = await lookupPost(wrongReq);
      expect(wrongRes.status).toBe(401);

      const malformedReq = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic some_basic_auth_creds"
        },
        body: JSON.stringify({ invoice_number: "061026-23" })
      });
      const malformedRes = await lookupPost(malformedReq);
      expect(malformedRes.status).toBe(401);
    });

    it("should return 400 when request body is invalid or not an object", async () => {
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: "invalid-json-{{"
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(400);
    });

    it("should return 400 when invoice_number is missing, empty string, or whitespace-only", async () => {
      const req1 = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({})
      });
      const res1 = await lookupPost(req1);
      expect(res1.status).toBe(400);

      const req2 = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ invoice_number: "    " })
      });
      const res2 = await lookupPost(req2);
      expect(res2.status).toBe(400);
    });

    it("should return matched: false for unknown invoice", async () => {
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ invoice_number: "NON_EXISTENT_INV_99999" })
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.matched).toBe(false);
      expect(data.reference).toBeNull();
    });

    it("should not match substring when invoice query length is less than 4 chars", async () => {
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ invoice_number: "ZZZ" })
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.matched).toBe(false);
    });

    it("should return matched: true for existing invoice", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          customer_name: sampleSales.customerName
        })
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.matched).toBe(true);
      expect(data.customer_matched).toBe(true);
      expect(data.reference).toBe(sampleSales.id);
      expect(data.customer_name).toBe(sampleSales.customerName);
    });

    it("should return matched: true and customer_matched: false when invoice matches but OCR customer differs", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;
      const req = new Request("http://localhost/api/cctv/labels/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          customer_name: "J&T CARGO EKSPEDISI BEDA NAMA"
        })
      });
      const res = await lookupPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.matched).toBe(true);
      expect(data.customer_matched).toBe(false);
      expect(data.reference).toBe(sampleSales.id);
      expect(data.customer_name).toBe(sampleSales.customerName);
      expect(data.note).toContain("Customer OCR berbeda");
    });
  });

  describe("POST /api/cctv/labels/sync", () => {
    it("should return 401 without Bearer token or with wrong token", async () => {
      const reqNoAuth = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: "INV-1" })
      });
      const resNoAuth = await syncPost(reqNoAuth);
      expect(resNoAuth.status).toBe(401);

      const reqWrongToken = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer WRONG_TOKEN_XYZ"
        },
        body: JSON.stringify({ invoice_number: "INV-1" })
      });
      const resWrongToken = await syncPost(reqWrongToken);
      expect(resWrongToken.status).toBe(401);
    });

    it("should return 400 when both invoice_number and slm_reference are empty or missing", async () => {
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ invoice_number: "   ", slm_reference: "" })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("invoice_number or slm_reference is required");
    });

    it("should return 404 when transaction is not found in database", async () => {
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ invoice_number: "TOTALLY_NON_EXISTENT_99999" })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.saved).toBe(false);
      expect(data.error).toBe("Sales record not found");
    });

    it("should handle invalid packing_completed_at date string gracefully without crashing", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          event_type: "packing_completed",
          packing_completed_at: "invalid-not-a-date-at-all",
          evidence_url: "https://cctvslm.playgo.id/labels/999"
        })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe(true);
      expect(data.packing_status).toBe("sudah");
    });

    it("should handle corrupted base64 screenshot string safely without crashing", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          event_type: "packing_completed",
          screenshot: "data:image/jpeg;base64,corrupted!!!not-valid-base64-payload###",
          evidence_url: "https://cctvslm.playgo.id/labels/fallback-base64"
        })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe(true);
      expect(data.receipt_photo_url).toBe("https://cctvslm.playgo.id/labels/fallback-base64");
    });

    it("should reject non-image file uploads (e.g. .sh) and fallback safely", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;

      const formData = new FormData();
      formData.append("invoice_number", invoiceNumber);
      formData.append("event_type", "packing_completed");
      formData.append("evidence_url", "https://cctvslm.playgo.id/labels/safe-fallback");

      const evilFile = new File([Buffer.from("echo 'evil'")], "malicious.sh", {
        type: "text/x-shellscript"
      });
      formData.append("screenshot", evilFile);

      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`
        },
        body: formData
      });

      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe(true);
      expect(data.receipt_photo_url).toBe("https://cctvslm.playgo.id/labels/safe-fallback");
    });

    it("should successfully sync packing completion with fallback URL", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          cctv_label_id: 101,
          invoice_number: invoiceNumber,
          customer_name: sampleSales.customerName,
          source_label: "Aneka Jaya",
          slm_reference: sampleSales.id,
          first_seen_at: new Date().toISOString(),
          event_type: "packing_completed",
          packing_completed_at: new Date().toISOString(),
          evidence_url: "https://cctvslm.playgo.id/labels/101"
        })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe(true);
      expect(data.packing_status).toBe("sudah");
      expect(data.receipt_photo_url).toBe("https://cctvslm.playgo.id/labels/101");

      // Verifikasi di DB
      const updated = await prisma.salesRecord.findUnique({
        where: { id: sampleSales.id },
        include: { deliveryOrder: true }
      });
      expect(updated?.doPackingStatus).toBe("sudah");
      if (updated?.deliveryOrder) {
        expect(updated.deliveryOrder.packingStatus).toBe("sudah");
        expect(updated.deliveryOrder.packedByNameSnapshot).toBe("CCTV Auto-Packing");

        // Verifikasi entri Audit Trail
        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: "delivery_order",
            entityId: updated.deliveryOrder.id,
            action: "cctv_packing_sync"
          },
          orderBy: { createdAt: "desc" }
        });
        expect(audit).toBeDefined();
        expect(audit?.userNameSnapshot).toBe("CCTV Auto-Packing");
        expect(audit?.userRoleSnapshot).toBe("OWNER");
      }
    });

    it("should save physical screenshot file to disk when sent via multipart/form-data", async () => {
      if (!sampleSales) return;
      const invoiceNumber = sampleSales.transactionNumber || sampleSales.id;

      const formData = new FormData();
      formData.append("cctv_label_id", "102");
      formData.append("invoice_number", invoiceNumber);
      formData.append("event_type", "packing_completed");
      formData.append("packing_completed_at", new Date().toISOString());
      formData.append("evidence_url", "https://cctvslm.playgo.id/labels/102");

      const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb]);
      const dummyFile = new File([validJpegBytes], "cctv_test_snapshot.jpg", {
        type: "image/jpeg"
      });
      formData.append("screenshot", dummyFile);

      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`
        },
        body: formData
      });

      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe(true);
      expect(data.packing_status).toBe("sudah");
      expect(data.receipt_photo_url).toMatch(/^\/uploads\/receipts\/cctv-pack-.*\.jpg$/);

      // Verifikasi DeliveryOrder di DB memuat URL file fisik lokal
      const updated = await prisma.deliveryOrder.findFirst({
        where: { salesRecordId: sampleSales.id }
      });
      expect(updated?.receiptPhotoUrl).toBe(data.receipt_photo_url);

      // Bersihkan file uji yang terbuat di disk
      const { existsSync } = await import("node:fs");
      const { unlink } = await import("node:fs/promises");
      const pathModule = await import("node:path");
      const localFilePath = pathModule.default.join(process.cwd(), "public", data.receipt_photo_url);
      if (existsSync(localFilePath)) {
        await unlink(localFilePath);
      }

      await prisma.cctvDetectionLog.deleteMany({
        where: { screenshotPhotoUrl: data.receipt_photo_url }
      }).catch(() => {});
    });
  });

  afterAll(async () => {
    if (sampleSales?.id) {
      await prisma.deliveryOrder.updateMany({
        where: { salesRecordId: sampleSales.id },
        data: { receiptPhotoUrl: sampleSales.deliveryOrder?.receiptPhotoUrl ?? null }
      }).catch(() => {});
      await prisma.salesRecord.updateMany({
        where: { id: sampleSales.id },
        data: { doReceiptPhotoUrl: sampleSales.doReceiptPhotoUrl ?? null }
      }).catch(() => {});
    }
    await prisma.cctvDetectionLog.deleteMany({
      where: {
        OR: [
          { evidenceUrl: { contains: "playgo.id" } },
          { screenshotPhotoUrl: { startsWith: "/uploads/receipts/cctv-pack-" } },
          { cctvLabelId: { in: [101, 102, 999] } }
        ]
      }
    }).catch(() => {});
  });
});
