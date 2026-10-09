import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deliveryOrder = {
    findUnique: vi.fn(),
    update: vi.fn()
  };
  const salesRecord = {
    update: vi.fn()
  };

  const tx = {
    deliveryOrder,
    salesRecord
  };

  return {
    tx,
    deliveryOrder,
    salesRecord,
    prisma: {
      ...tx,
      $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx))
    },
    getCurrentRole: vi.fn(),
    getCurrentUser: vi.fn(),
    recordAudit: vi.fn()
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit/store", () => ({
  recordAudit: mocks.recordAudit
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: mocks.getCurrentRole,
  getCurrentUser: mocks.getCurrentUser
}));

import { updateDeliveryOrderReceiptPhotos } from "@/lib/deliveryOrders/store";
import { PATCH, POST } from "@/app/api/delivery-orders/[id]/receipt-photos/route";

describe("Delivery Order Receipt Photos Store & API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateDeliveryOrderReceiptPhotos store function", () => {
    it("updates DeliveryOrder and SalesRecord with receipt photo url and records audit", async () => {
      mocks.deliveryOrder.findUnique.mockResolvedValue({
        id: "do-100",
        salesRecordId: "sale-200",
        receiptPhotoUrl: "https://old.com/photo.jpg"
      });
      mocks.deliveryOrder.update.mockResolvedValue({
        id: "do-100",
        receiptPhotoUrl: JSON.stringify(["https://new.com/1.jpg", "https://new.com/2.jpg"]),
        items: []
      });
      mocks.salesRecord.update.mockResolvedValue({ id: "sale-200" });

      const actor = {
        id: "user-driver-1",
        name: "Budi Driver",
        username: "budi",
        role: "DELIVERY_DRIVER" as const
      };

      const newPhotos = JSON.stringify(["https://new.com/1.jpg", "https://new.com/2.jpg"]);
      const result = await updateDeliveryOrderReceiptPhotos("do-100", newPhotos, actor);

      expect(mocks.deliveryOrder.findUnique).toHaveBeenCalledWith({ where: { id: "do-100" } });
      expect(mocks.deliveryOrder.update).toHaveBeenCalledWith({
        where: { id: "do-100" },
        data: { receiptPhotoUrl: newPhotos },
        include: { items: true }
      });
      expect(mocks.salesRecord.update).toHaveBeenCalledWith({
        where: { id: "sale-200" },
        data: { doReceiptPhotoUrl: newPhotos }
      });
      expect(mocks.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "delivery_order",
          entityId: "do-100",
          action: "update",
          afterValue: { receiptPhotoUrl: newPhotos }
        })
      );
      expect(result.id).toBe("do-100");
    });

    it("throws error if Delivery Order is not found", async () => {
      mocks.deliveryOrder.findUnique.mockResolvedValue(null);

      await expect(
        updateDeliveryOrderReceiptPhotos("invalid-id", "https://photo.jpg")
      ).rejects.toThrow("Delivery Order tidak ditemukan.");
    });
  });

  describe("PATCH /api/delivery-orders/[id]/receipt-photos route", () => {
    it("returns 403 if user lacks do.process role", async () => {
      mocks.getCurrentRole.mockResolvedValue("CUSTOMER_SERVICE");

      const req = new Request("http://localhost/api/delivery-orders/do-100/receipt-photos", {
        method: "PATCH",
        body: JSON.stringify({ receiptPhotoUrl: "https://example.com/photo.jpg" })
      });

      const response = await PATCH(req, { params: Promise.resolve({ id: "do-100" }) });
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Tidak memiliki hak akses");
    });

    it("successfully updates receipt photo when authorized and returns 200", async () => {
      mocks.getCurrentRole.mockResolvedValue("DELIVERY_DRIVER");
      mocks.getCurrentUser.mockResolvedValue({
        id: "driver-1",
        name: "Pak Supardi",
        username: "supardi",
        role: "DELIVERY_DRIVER"
      });

      mocks.deliveryOrder.findUnique.mockResolvedValue({
        id: "do-100",
        salesRecordId: "sale-100"
      });
      mocks.deliveryOrder.update.mockResolvedValue({
        id: "do-100",
        receiptPhotoUrl: "https://example.com/bukti.jpg",
        items: []
      });
      mocks.salesRecord.update.mockResolvedValue({ id: "sale-100" });

      const req = new Request("http://localhost/api/delivery-orders/do-100/receipt-photos", {
        method: "PATCH",
        body: JSON.stringify({ receiptPhotoUrl: "https://example.com/bukti.jpg" })
      });

      const response = await PATCH(req, { params: Promise.resolve({ id: "do-100" }) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.receiptPhotoUrl).toBe("https://example.com/bukti.jpg");
    });

    it("also handles POST method as alias to PATCH", async () => {
      mocks.getCurrentRole.mockResolvedValue("ADMIN");
      mocks.getCurrentUser.mockResolvedValue({
        id: "admin-1",
        name: "Admin",
        username: "admin",
        role: "ADMIN"
      });

      mocks.deliveryOrder.findUnique.mockResolvedValue({
        id: "do-100",
        salesRecordId: "sale-100"
      });
      mocks.deliveryOrder.update.mockResolvedValue({
        id: "do-100",
        receiptPhotoUrl: "https://example.com/bukti.jpg",
        items: []
      });
      mocks.salesRecord.update.mockResolvedValue({ id: "sale-100" });

      const req = new Request("http://localhost/api/delivery-orders/do-100/receipt-photos", {
        method: "POST",
        body: JSON.stringify({ receiptPhotoUrl: "https://example.com/bukti.jpg" })
      });

      const response = await POST(req, { params: Promise.resolve({ id: "do-100" }) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
