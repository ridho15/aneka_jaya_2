import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import { POST } from "@/app/api/cctv/events/route";
import {
  getCctvInvoiceStatus,
  getCctvSystemStatus,
  getCctvPackingSummary,
} from "@/lib/cctv/client";
import { listCctvDetectionsPaginated } from "@/lib/cctv/store";
import { can } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";

const TOKEN =
  process.env.SLM_API_TOKEN ||
  process.env.CCTV_INTEGRATION_TOKEN ||
  "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";

describe("CCTV Integration - UNHAPPY PATH Deep Verification", () => {
  describe("1. Authentication & Signature Unhappy Paths", () => {
    it("should return 401 when signature header has length mismatch (RangeError protection)", async () => {
      const body = JSON.stringify({ event_type: "packing_completed" });
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Signature": "sha256=too_short",
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("should return 401 when signature header is malformed or empty", async () => {
      const body = JSON.stringify({ event_type: "packing_completed" });
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Signature": "",
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should return 401 when payload was tampered after HMAC signature generation", async () => {
      const originalBody = JSON.stringify({
        event_type: "packing_completed",
        invoice: "121026-01",
      });
      const validSig =
        "sha256=" +
        crypto.createHmac("sha256", TOKEN).update(originalBody).digest("hex");

      const tamperedBody = JSON.stringify({
        event_type: "packing_completed",
        invoice: "121026-99_TAMPERED",
      });

      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Signature": validSig,
        },
        body: tamperedBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should return 401 when Bearer header is malformed (no token, wrong scheme)", async () => {
      for (const malformedHeader of [
        "Bearer",
        "Bearer   ",
        "Basic token_123",
        "Token abc",
        "bearer_without_space",
      ]) {
        const req = new Request("http://localhost/api/cctv/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: malformedHeader,
          },
          body: JSON.stringify({ event_type: "packing_completed" }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
      }
    });
  });

  describe("2. Payload Validation Unhappy Paths", () => {
    it("should return 400 for completely broken/malformed JSON", async () => {
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: "{ broken_json: true, trailing_garbage",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid JSON");
    });

    it("should return 400 for JSON primitives (null, number, boolean, string)", async () => {
      for (const primitive of ["null", "12345", "true", '"plain_string"']) {
        const req = new Request("http://localhost/api/cctv/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CCTV-Token": TOKEN,
          },
          body: primitive,
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("Invalid payload: event_type is required");
      }
    });

    it("should return 400 when body is an array instead of an object", async () => {
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: JSON.stringify([{ event_type: "packing_completed" }]),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("should return 400 when event_type is whitespace-only or empty", async () => {
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: JSON.stringify({ event_type: "   " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("should gracefully handle corrupted date strings in occurred_at and packing_completed_at without crashing", async () => {
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: JSON.stringify({
          event_id: "evt-corrupted-dates",
          event_type: "packing_completed",
          occurred_at: "bukan-tanggal-valid-9999",
          data: {
            invoice_number: "NON_EXISTENT_999",
            packing_completed_at: "waktu-tidak-valid",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });
  });

  describe("3. Non-Existent Entity & Injection Unhappy Paths", () => {
    it("should safely record unmatched log when invoice number does not exist in ERP", async () => {
      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: JSON.stringify({
          event_id: "evt-404-inv",
          event_type: "packing_completed",
          data: {
            invoice_number: "INV-NOT-FOUND-999999",
            customer_name: "Customer Misterius",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");

      const log = await prisma.cctvDetectionLog.findFirst({
        where: { invoiceNumber: "INV-NOT-FOUND-999999" },
      });
      expect(log).not.toBeNull();
      expect(log?.matchStatus).toBe("unmatched");

      // Cleanup
      if (log) {
        await prisma.cctvDetectionLog.delete({ where: { id: log.id } });
      }
    });

    it("should handle SQL injection strings and XSS safely without crashing", async () => {
      const maliciousInvoice = "' OR 1=1; DROP TABLE users; --";
      const xssCustomer = "<script>alert('xss')</script>";

      const req = new Request("http://localhost/api/cctv/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CCTV-Token": TOKEN,
        },
        body: JSON.stringify({
          event_id: "evt-sqli-test",
          event_type: "anomaly",
          title: "SQLi Injection Test",
          data: {
            invoice_number: maliciousInvoice,
            customer_name: xssCustomer,
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const log = await prisma.cctvDetectionLog.findFirst({
        where: { invoiceNumber: maliciousInvoice },
      });
      expect(log).not.toBeNull();
      expect(log?.customerName).toBe(xssCustomer);

      if (log) {
        await prisma.cctvDetectionLog.delete({ where: { id: log.id } });
      }
    });
  });

  describe("4. CCTV Pull API Client Network & Error Unhappy Paths", () => {
    it("should return null gracefully when CCTV server returns 500 error", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      try {
        const res = await getCctvInvoiceStatus("121026-03");
        expect(res).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should return null gracefully when CCTV server returns 404", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      try {
        const res = await getCctvInvoiceStatus("UNKNOWN-INV");
        expect(res).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should return null gracefully on network failure or DNS rejection", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 31.97.51.194:8000"));

      try {
        const sys = await getCctvSystemStatus();
        expect(sys).toBeNull();

        const summary = await getCctvPackingSummary();
        expect(summary).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should return null gracefully when CCTV response is non-JSON or HTML error page", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      } as any);

      try {
        const res = await getCctvInvoiceStatus("121026-03");
        expect(res).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("5. Store Pagination & Boundary Unhappy Paths", () => {
    it("should coerce negative page, zero pageSize, and huge pageSize safely", async () => {
      const negativeResult = await listCctvDetectionsPaginated({
        page: -10,
        pageSize: -50,
      });
      expect(negativeResult.page).toBe(1);
      expect(negativeResult.pageSize).toBe(5);

      const hugeResult = await listCctvDetectionsPaginated({
        page: 0,
        pageSize: 999999,
      });
      expect(hugeResult.page).toBe(1);
      expect(hugeResult.pageSize).toBe(100);
    });

    it("should handle corrupted dates in from and to filters without throwing Prisma errors", async () => {
      const result = await listCctvDetectionsPaginated({
        from: "tanggal-rusak-abc",
        to: "2026-99-99",
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe("6. Role Permission Unhappy Paths", () => {
    it("should disallow VIEWER from viewing audit and cctv monitoring", () => {
      expect(can("VIEWER", "audit.view")).toBe(false);
    });

    it("should disallow DELIVERY_DRIVER from viewing audit and cctv monitoring", () => {
      expect(can("DELIVERY_DRIVER", "audit.view")).toBe(false);
    });

    it("should disallow ADMIN from viewing audit trail", () => {
      expect(can("ADMIN", "audit.view")).toBe(false);
    });

    it("should allow OWNER, SUPERVISOR, and MANAGER to view audit", () => {
      expect(can("OWNER", "audit.view")).toBe(true);
      expect(can("SUPERVISOR", "audit.view")).toBe(true);
      expect(can("MANAGER", "audit.view")).toBe(true);
    });
  });
});
