import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listLocalStockItems: vi.fn(),
  listProducts: vi.fn(),
  listLocations: vi.fn(),
  createAdjustment: vi.fn(),
  findFirstLocation: vi.fn()
}));

vi.mock("@/lib/integrations/mj/auth", () => ({
  authenticateMjRequest: mocks.authenticate
}));

vi.mock("@/lib/inventory/legacyAdapter", () => ({
  listLocalStockItems: mocks.listLocalStockItems
}));

vi.mock("@/lib/inventory/service", () => ({
  listProducts: mocks.listProducts,
  listLocations: mocks.listLocations,
  createAdjustment: mocks.createAdjustment
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    inventoryLocation: {
      findFirst: mocks.findFirstLocation
    }
  }
}));

import { GET as getStocks } from "@/app/api/integrations/mj/stocks/route";
import { GET as getProducts } from "@/app/api/integrations/mj/products/route";
import { GET as getLocations } from "@/app/api/integrations/mj/locations/route";
import { POST as postAdjust } from "@/app/api/integrations/mj/stocks/adjust/route";
import { MjIntegrationError } from "@/lib/integrations/mj/errors";
import { InventoryError } from "@/lib/inventory/errors";

describe("Adversarial QA & Unhappy Path Verification: MJ Inventory Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      clientId: "client-mj-test",
      clientCode: "mj",
      environment: "sandbox",
      tokenId: "token-test-1"
    });
  });

  describe("Security & Auth Boundaries", () => {
    it.each([
      ["missing token", new MjIntegrationError("AUTH_INVALID", "Header Authorization wajib diisi.", 401)],
      ["expired token", new MjIntegrationError("AUTH_INVALID", "Token integrasi telah kedaluwarsa.", 401)],
      ["rate limited", new MjIntegrationError("RATE_LIMITED", "Rate limit terlampaui. Coba lagi dalam beberapa detik.", 429)]
    ])("rejects request with %s", async (_label, authError) => {
      mocks.authenticate.mockRejectedValueOnce(authError);

      const resStocks = await getStocks(new Request("http://local/api/integrations/mj/stocks"));
      expect(resStocks.status).toBe(authError.status);
      const jsonStocks = await resStocks.json();
      expect(jsonStocks.success).toBe(false);
      expect(jsonStocks.error.code).toBe(authError.code);
    });
  });

  describe("GET /api/integrations/mj/locations - Adversarial Inputs", () => {
    it("rejects invalid location type with 400 VALIDATION_FAILED", async () => {
      const res = await getLocations(new Request("http://local/api/integrations/mj/locations?type=UNSUPPORTED_TYPE"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("WAREHOUSE atau STORE");
    });

    it("normalizes case-insensitive type parameters", async () => {
      mocks.listLocations.mockResolvedValueOnce([]);
      const res = await getLocations(new Request("http://local/api/integrations/mj/locations?type=warehouse"));
      expect(res.status).toBe(200);
      expect(mocks.listLocations).toHaveBeenCalledWith(expect.objectContaining({ type: "WAREHOUSE" }));
    });
  });

  describe("GET /api/integrations/mj/products - Boundary Clamping", () => {
    it("clamps negative, zero, and NaN page numbers to 1", async () => {
      mocks.listProducts.mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
      const res = await getProducts(new Request("http://local/api/integrations/mj/products?page=-10"));
      expect(res.status).toBe(200);
      expect(mocks.listProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    });

    it("clamps oversized pageSize to maximum 200", async () => {
      mocks.listProducts.mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 200, total: 0, totalPages: 1 } });
      const res = await getProducts(new Request("http://local/api/integrations/mj/products?page_size=99999"));
      expect(res.status).toBe(200);
      expect(mocks.listProducts).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 200 }));
    });

    it("handles extreme special characters in search keyword safely", async () => {
      mocks.listProducts.mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
      const maliciousKeyword = "' OR '1'='1' -- \\'; DROP TABLE products;";
      const res = await getProducts(new Request(`http://local/api/integrations/mj/products?keyword=${encodeURIComponent(maliciousKeyword)}`));
      expect(res.status).toBe(200);
      expect(mocks.listProducts).toHaveBeenCalledWith(expect.objectContaining({ keyword: maliciousKeyword }));
    });
  });

  describe("POST /api/integrations/mj/stocks/adjust - Adversarial Payloads & Error Handling", () => {
    it("rejects non-JSON or malformed body with 400", async () => {
      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: "{ malformed json..."
      }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects payload missing location identifier", async () => {
      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          reason: "Alasan penyesuaian",
          items: [{ sku: "BRG-01", quantity: 5 }]
        })
      }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(JSON.stringify(json)).toContain("location_id");
    });

    it("rejects reason with less than 3 characters", async () => {
      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "ab",
          items: [{ sku: "BRG-01", quantity: 5 }]
        })
      }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects adjustment item when quantity is 0", async () => {
      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "Koreksi data",
          items: [{ sku: "BRG-01", quantity: 0 }]
        })
      }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects adjustment item without any identifier (no product_id, sku, or external_product_id)", async () => {
      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "Koreksi data tanpa sku",
          items: [{ quantity: 10, notes: "tanpa kode" }]
        })
      }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("maps InventoryError NOT_FOUND for unknown product to PRODUCT_INVALID 404", async () => {
      mocks.createAdjustment.mockRejectedValueOnce(
        new InventoryError("NOT_FOUND", "Produk dengan SKU BRG-GHOUL tidak ditemukan.", 404)
      );

      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "Koreksi produk fiktif",
          items: [{ sku: "BRG-GHOUL", quantity: 5 }]
        })
      }));

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PRODUCT_INVALID");
    });

    it("maps database unique constraint collision (P2002) to REFERENCE_CONFLICT 409", async () => {
      const p2002Error = Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["idempotencyKey"] }
      });
      mocks.createAdjustment.mockRejectedValueOnce(p2002Error);

      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "Koreksi duplikat",
          idempotency_key: "idem-dup-key",
          items: [{ sku: "BRG-01", quantity: 2 }]
        })
      }));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("REFERENCE_CONFLICT");
    });

    it("returns 200 on replay of an existing adjustment with same idempotency key", async () => {
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      mocks.createAdjustment.mockResolvedValueOnce({
        id: "adj-existing",
        adjustmentNumber: "ADJ-202611-0001",
        idempotencyKey: "idem-replayed-123",
        createdAt: tenSecondsAgo
      });

      const res = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-01",
          reason: "Penyesuaian terkirim ulang",
          idempotency_key: "idem-replayed-123",
          items: [{ sku: "BRG-01", quantity: 5 }]
        })
      }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("adj-existing");
    });
  });
});
