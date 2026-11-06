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

describe("MJ Inventory Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      clientId: "client-mj-1",
      clientCode: "mj",
      environment: "sandbox",
      tokenId: "token-1"
    });
  });

  describe("GET /api/integrations/mj/stocks", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const response = await getStocks(new Request("http://local/api/integrations/mj/stocks"));
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTH_INVALID");
    });

    it("parses query params and returns stock items", async () => {
      const mockItems = [
        {
          id: "bal-1",
          productId: "prod-1",
          productCode: "BRG-01",
          productName: "Barang Satu",
          warehouse: "Gudang Utama",
          warehouseId: "loc-1",
          warehouseCode: "GDG",
          quantity: 25,
          unit: "Pcs",
          ready: true
        }
      ];
      mocks.listLocalStockItems.mockResolvedValueOnce(mockItems);

      const request = new Request("http://local/api/integrations/mj/stocks?keyword=baju&warehouse=Gudang&sku=BRG-01&product_id=prod-1");
      const response = await getStocks(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockItems);
      expect(mocks.listLocalStockItems).toHaveBeenCalledWith({
        keyword: "baju",
        sku: "BRG-01",
        warehouse: "Gudang",
        productId: "prod-1"
      });
    });
  });

  describe("GET /api/integrations/mj/products", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const response = await getProducts(new Request("http://local/api/integrations/mj/products"));
      expect(response.status).toBe(401);
    });

    it("parses pagination and filters, returning product list and metadata", async () => {
      const mockResult = {
        data: [
          {
            id: "prod-1",
            sku: "BRG-01",
            name: "Barang Satu",
            category: "Elektronik",
            unit: "Pcs",
            costPrice: 50000,
            sellingPrice: 75000,
            totalQuantity: 20
          }
        ],
        meta: { page: 2, pageSize: 25, total: 50, totalPages: 2 }
      };
      mocks.listProducts.mockResolvedValueOnce(mockResult);

      const request = new Request("http://local/api/integrations/mj/products?keyword=elektronik&page=2&page_size=25&include_inactive=false");
      const response = await getProducts(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockResult.data);
      expect(json.meta).toEqual(mockResult.meta);
      expect(mocks.listProducts).toHaveBeenCalledWith({
        keyword: "elektronik",
        page: 2,
        pageSize: 25,
        includeInactive: false
      });
    });
  });

  describe("GET /api/integrations/mj/locations", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const response = await getLocations(new Request("http://local/api/integrations/mj/locations"));
      expect(response.status).toBe(401);
    });

    it("fetches locations with type filter", async () => {
      const mockLocations = [
        { id: "loc-1", code: "GDG-1", name: "Gudang Utama", type: "WAREHOUSE", isActive: true }
      ];
      mocks.listLocations.mockResolvedValueOnce(mockLocations);

      const request = new Request("http://local/api/integrations/mj/locations?type=warehouse&include_inactive=true");
      const response = await getLocations(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockLocations);
      expect(mocks.listLocations).toHaveBeenCalledWith({
        type: "WAREHOUSE",
        includeInactive: true
      });
    });
  });

  describe("POST /api/integrations/mj/stocks/adjust", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.authenticate.mockRejectedValueOnce(
        new MjIntegrationError("AUTH_INVALID", "Bearer token tidak valid.", 401)
      );

      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({ location_id: "loc-1", reason: "Opname", items: [{ sku: "BRG-1", quantity: 5 }] })
      }));
      expect(response.status).toBe(401);
    });

    it("rejects invalid payload without location or reason", async () => {
      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({ reason: "ok", items: [{ sku: "BRG-1", quantity: 5 }] })
      }));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects adjustment item with quantity zero", async () => {
      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify({
          location_id: "loc-1",
          reason: "Koreksi salah input",
          items: [{ sku: "BRG-1", quantity: 0 }]
        })
      }));
      expect(response.status).toBe(400);
    });

    it("successfully creates adjustment with resolved ERP warehouse ID", async () => {
      mocks.findFirstLocation.mockResolvedValueOnce({ id: "internal-loc-id" });
      mocks.createAdjustment.mockResolvedValueOnce({
        id: "adj-1",
        adjustmentNumber: "ADJ-202611-0001",
        locationId: "internal-loc-id",
        reason: "Penyesuaian stok akhir shift",
        items: [{ id: "item-1", productId: "prod-1", quantity: 10 }]
      });

      const body = {
        warehouse_id: 101,
        reason: "Penyesuaian stok akhir shift",
        idempotency_key: "mj-adj-unique-123",
        items: [
          { sku: "BRG-01", quantity: 10, unit_cost: 45000, notes: "Ditemukan di rak atas" }
        ]
      };

      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify(body)
      }));

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("adj-1");

      expect(mocks.findFirstLocation).toHaveBeenCalledWith({
        where: { erpWarehouseId: 101 },
        select: { id: true }
      });

      expect(mocks.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: "internal-loc-id",
          reason: "Penyesuaian stok akhir shift",
          idempotencyKey: "mj-adj-unique-123",
          items: [
            expect.objectContaining({
              sku: "BRG-01",
              quantity: 10,
              unitCost: 45000,
              notes: "Ditemukan di rak atas"
            })
          ]
        }),
        expect.objectContaining({
          id: "client-mj-1",
          name: "MJ Integration (mj)"
        })
      );
    });

    it("handles negative adjustment (reduction) cleanly", async () => {
      mocks.createAdjustment.mockResolvedValueOnce({
        id: "adj-2",
        adjustmentNumber: "ADJ-202611-0002"
      });

      const body = {
        location_id: "loc-utama",
        reason: "Barang rusak kena bocor",
        items: [
          { product_id: "prod-2", quantity: -3, notes: "Rusak" }
        ]
      };

      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify(body)
      }));

      expect(response.status).toBe(201);
      expect(mocks.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: "loc-utama",
          reason: "Barang rusak kena bocor",
          items: [
            expect.objectContaining({
              productId: "prod-2",
              quantity: -3,
              notes: "Rusak"
            })
          ]
        }),
        expect.any(Object)
      );
    });

    it("maps InventoryError to MjIntegrationError format with proper status code", async () => {
      mocks.createAdjustment.mockRejectedValueOnce(
        new InventoryError("INSUFFICIENT_STOCK", "Stok tidak mencukupi untuk pengurangan.", 409)
      );

      const body = {
        location_id: "loc-utama",
        reason: "Pengurangan stok",
        items: [{ sku: "BRG-1", quantity: -999 }]
      };

      const response = await postAdjust(new Request("http://local/api/integrations/mj/stocks/adjust", {
        method: "POST",
        body: JSON.stringify(body)
      }));

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toBe("Stok tidak mencukupi untuk pengurangan.");
    });
  });
});

