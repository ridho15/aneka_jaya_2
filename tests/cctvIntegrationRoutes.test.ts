import { describe, it, expect, beforeAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { POST as lookupPost } from "@/app/api/cctv/labels/lookup/route";
import { POST as syncPost } from "@/app/api/cctv/labels/sync/route";
import { prisma } from "@/lib/db/prisma";

const TOKEN = "cctv-slm-token-2026";

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
      expect(data.reference).toBe(sampleSales.id);
      expect(data.customer_name).toBe(sampleSales.customerName);
    });
  });

  describe("POST /api/cctv/labels/sync", () => {
    it("should return 401 without Bearer token", async () => {
      const req = new Request("http://localhost/api/cctv/labels/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: "INV-1" })
      });
      const res = await syncPost(req);
      expect(res.status).toBe(401);
    });

    it("should successfully sync packing completion", async () => {
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

      // Verifikasi di DB
      const updated = await prisma.salesRecord.findUnique({
        where: { id: sampleSales.id },
        include: { deliveryOrder: true }
      });
      expect(updated?.doPackingStatus).toBe("sudah");
      if (updated?.deliveryOrder) {
        expect(updated.deliveryOrder.packingStatus).toBe("sudah");
      }
    });
  });
});
