import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  releaseSaleStockLocal: vi.fn(),
  cancelSaleStockLocal: vi.fn(),
  replaceSaleStockLocal: vi.fn()
}));

vi.mock("@/lib/integrations/mj/auth", () => ({
  authenticateMjRequest: mocks.authenticate
}));

vi.mock("@/lib/inventory/service", () => ({
  releaseSaleStockLocal: mocks.releaseSaleStockLocal,
  cancelSaleStockLocal: mocks.cancelSaleStockLocal,
  replaceSaleStockLocal: mocks.replaceSaleStockLocal
}));

import { POST as postRelease } from "@/app/api/integrations/mj/stocks/release/route";
import { POST as postCancel } from "@/app/api/integrations/mj/stocks/cancel/route";
import { POST as postReplace } from "@/app/api/integrations/mj/stocks/replace/route";
import { MjIntegrationError } from "@/lib/integrations/mj/errors";
import { InventoryError } from "@/lib/inventory/errors";

describe("MJ Stock Release & Cancel Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      clientId: "client-mj-1",
      clientCode: "mj",
      environment: "sandbox",
      tokenId: "token-1"
    });
  });

  describe("POST /api/integrations/mj/stocks/release", () => {
    const validPayload = {
      reference: "MJ-20261106-0001-STOCK",
      sale_date: "2026-11-06",
      source_number: "MJ-20261106-0001",
      warehouse_id: "1",
      items: [
        {
          sku: "CAT-001",
          quantity: 2,
          unit_price: 100000
        }
      ]
    };

    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const res = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          body: JSON.stringify(validPayload)
        })
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTH_INVALID");
    });

    it("validates missing reference or empty items", async () => {
      const resMissingRef = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          body: JSON.stringify({ items: validPayload.items })
        })
      );
      expect(resMissingRef.status).toBe(400);

      const resEmptyItems = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          body: JSON.stringify({ reference: "REF-1", items: [] })
        })
      );
      expect(resEmptyItems.status).toBe(400);

      const resBadQty = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          body: JSON.stringify({
            reference: "REF-1",
            items: [{ sku: "SKU-1", quantity: -5 }]
          })
        })
      );
      expect(resBadQty.status).toBe(400);
    });

    it("processes a valid stock release successfully (201)", async () => {
      mocks.releaseSaleStockLocal.mockResolvedValueOnce({ status: "released" });

      const res = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload)
        })
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        data: {
          status: "released",
          releaseReference: "MJ-20261106-0001-STOCK"
        }
      });

      expect(mocks.releaseSaleStockLocal).toHaveBeenCalledWith(
        {
          reference: "MJ-20261106-0001-STOCK",
          saleDate: "2026-11-06",
          sourceNumber: "MJ-20261106-0001",
          items: [
            {
              productId: undefined,
              productRef: "CAT-001",
              warehouseId: "1",
              quantity: 2,
              allowNegative: false
            }
          ]
        },
        expect.objectContaining({ id: "client-mj-1" })
      );
    });

    it("returns 200 with already_released when release is replayed idempotently", async () => {
      mocks.releaseSaleStockLocal.mockResolvedValueOnce({ status: "already_released" });

      const res = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload)
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe("already_released");
    });

    it("maps InventoryError PRODUCT_INVALID when product not found", async () => {
      mocks.releaseSaleStockLocal.mockRejectedValueOnce(
        new InventoryError("NOT_FOUND", "Produk CAT-UNKNOWN tidak ditemukan di master inventory SLM.", 404)
      );

      const res = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload)
        })
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PRODUCT_INVALID");
    });

    it("maps INSUFFICIENT_STOCK to 409 STOCK_INSUFFICIENT so oversell is blocked", async () => {
      mocks.releaseSaleStockLocal.mockRejectedValueOnce(
        new InventoryError("INSUFFICIENT_STOCK", "Stok Barang tidak mencukupi (tersedia 4, dibutuhkan 50).", 409)
      );

      const res = await postRelease(
        new Request("http://local/api/integrations/mj/stocks/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload)
        })
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("STOCK_INSUFFICIENT");
    });
  });

  describe("POST /api/integrations/mj/stocks/cancel", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const res = await postCancel(
        new Request("http://local/api/integrations/mj/stocks/cancel", {
          method: "POST",
          body: JSON.stringify({ reference: "MJ-20261106-0001-STOCK" })
        })
      );

      expect(res.status).toBe(401);
    });

    it("rejects empty reference", async () => {
      const res = await postCancel(
        new Request("http://local/api/integrations/mj/stocks/cancel", {
          method: "POST",
          body: JSON.stringify({ reference: "   " })
        })
      );

      expect(res.status).toBe(400);
    });

    it("processes valid cancel successfully (200)", async () => {
      mocks.cancelSaleStockLocal.mockResolvedValueOnce({ status: "reversed" });

      const res = await postCancel(
        new Request("http://local/api/integrations/mj/stocks/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: "MJ-20261106-0001-STOCK",
            reason: "Nota dibatalkan kasir"
          })
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        data: {
          status: "reversed",
          reference: "MJ-20261106-0001-STOCK"
        }
      });

      expect(mocks.cancelSaleStockLocal).toHaveBeenCalledWith(
        {
          reference: "MJ-20261106-0001-STOCK",
          reason: "Nota dibatalkan kasir",
          mustExist: true
        },
        expect.objectContaining({ id: "client-mj-1" })
      );
    });

    it("returns 404 instead of a fake success when the reference was never released", async () => {
      const { InventoryError } = await import("@/lib/inventory/errors");
      mocks.cancelSaleStockLocal.mockRejectedValueOnce(new InventoryError("NOT_FOUND", "Rilis stok dengan referensi X tidak ditemukan.", 404));

      const res = await postCancel(
        new Request("http://local/api/integrations/mj/stocks/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: "NEVER-EXISTED", reason: "uji" })
        })
      );

      expect(res.status).toBe(404);
      expect((await res.json()).success).toBe(false);
    });
  });

  describe("POST /api/integrations/mj/stocks/replace", () => {
    const payload = { old_reference: "MJ-1-STOCK", reference: "MJ-1-STOCK-REV1", sale_date: "2026-11-06", items: [{ sku: "CAT-001", quantity: 3 }] };
    const call = (body: unknown) => postReplace(new Request("http://local/api/integrations/mj/stocks/replace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401));
      expect((await call(payload)).status).toBe(401);
      expect(mocks.replaceSaleStockLocal).not.toHaveBeenCalled();
    });

    it("rejects a payload without old_reference", async () => {
      expect((await call({ ...payload, old_reference: undefined })).status).toBe(400);
    });

    it("replaces with allowNegative false", async () => {
      mocks.replaceSaleStockLocal.mockResolvedValueOnce({ status: "replaced" });
      const res = await call(payload);
      expect(res.status).toBe(200);
      expect(mocks.replaceSaleStockLocal).toHaveBeenCalledWith(
        expect.objectContaining({ oldReference: "MJ-1-STOCK", reference: "MJ-1-STOCK-REV1", items: [expect.objectContaining({ productRef: "CAT-001", quantity: 3, allowNegative: false })] }),
        expect.objectContaining({ id: "client-mj-1" })
      );
    });

    it("maps INSUFFICIENT_STOCK to 409 STOCK_INSUFFICIENT", async () => {
      mocks.replaceSaleStockLocal.mockRejectedValueOnce(new InventoryError("INSUFFICIENT_STOCK", "Stok kurang.", 409));
      const res = await call(payload);
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("STOCK_INSUFFICIENT");
    });
  });
});
