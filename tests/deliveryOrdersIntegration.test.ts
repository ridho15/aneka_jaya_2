import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deliveryOrder = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  };
  const deliveryOrderItem = {
    updateMany: vi.fn()
  };
  const salesRecord = {
    findUnique: vi.fn(),
    update: vi.fn()
  };
  const user = {
    findMany: vi.fn()
  };

  const tx = {
    deliveryOrder,
    deliveryOrderItem,
    salesRecord,
    user
  };

  return {
    tx,
    deliveryOrder,
    deliveryOrderItem,
    salesRecord,
    user,
    prisma: {
      ...tx,
      $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx))
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit/store", () => ({
  recordAudit: vi.fn().mockResolvedValue({})
}));

describe("Delivery Order E2E Lifecycle & Strict Data Masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Creates DO and synchronizes SalesRecord denormalized fields", async () => {
    const { createDeliveryOrderForSale } = await import("@/lib/deliveryOrders/store");

    const mockSale = {
      id: "sale-lifecycle-1",
      transactionNumber: "TRX-050926-01",
      customerName: "Budi Jaya Bangunan",
      customerLocation: "Cikarang",
      shippingMethod: "J&T Cargo",
      items: [
        {
          id: "item-1",
          productRef: "SEMEN-GRESIK-50KG",
          manualProduct: JSON.stringify({ name: "Semen Gresik 50kg" }),
          warehouseNameSnapshot: "Gudang Utama",
          rackNameSnapshot: "Rak A-01",
          unitSnapshot: "Sak",
          quantity: 20
        },
        {
          id: "item-2",
          productRef: "BESI-BETON-10MM",
          manualProduct: JSON.stringify({ name: "Besi Beton 10mm" }),
          warehouseNameSnapshot: "Gudang Besi",
          rackNameSnapshot: "Area B-Besi",
          unitSnapshot: "Batang",
          quantity: 10
        }
      ]
    };

    mocks.deliveryOrder.findUnique.mockResolvedValue(null);
    mocks.salesRecord.findUnique.mockResolvedValue(mockSale);
    mocks.deliveryOrder.create.mockImplementation(({ data }: any) => ({
      id: "do-lifecycle-1",
      ...data,
      items: data.items.create
    }));

    const created = await createDeliveryOrderForSale("sale-lifecycle-1");

    expect(created.doNumber).toBe("DO-TRX-050926-01");
    expect(mocks.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-lifecycle-1" },
      data: {
        doStatus: "belum_selesai",
        doPackingStatus: "belum",
        doShippingStatus: "belum"
      }
    });
  });

  it("2. Strictly masks financial and pricing data in getDeliveryOrderDetail", async () => {
    const { getDeliveryOrderDetail } = await import("@/lib/deliveryOrders/store");

    const mockDoRow = {
      id: "do-masked-1",
      doNumber: "DO-TRX-050926-01",
      salesRecordId: "sale-lifecycle-1",
      status: "belum_selesai",
      packingStatus: "belum",
      shippingStatus: "belum",
      createdAt: new Date(),
      updatedAt: new Date(),
      salesRecord: {
        id: "sale-lifecycle-1",
        transactionNumber: "TRX-050926-01",
        saleDate: new Date("2026-09-05"),
        customerName: "Budi Jaya Bangunan",
        customerLocation: "Cikarang",
        shippingMethod: "J&T Cargo",
        deliveryAt: null
      },
      items: [
        {
          id: "do-item-1",
          deliveryOrderId: "do-masked-1",
          salesRecordItemId: "item-1",
          productRef: "SEMEN-GRESIK-50KG",
          productNameSnapshot: "Semen Gresik 50kg",
          warehouseNameSnapshot: "Gudang Utama",
          rackNameSnapshot: "Rak A-01",
          unitSnapshot: "Sak",
          quantity: 20,
          isShipped: false,
          shippedQuantity: 0,
          shippedAt: null
        }
      ]
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockDoRow);

    const detail = await getDeliveryOrderDetail("do-masked-1");
    expect(detail).not.toBeNull();

    // Verification of allowed fields
    expect(detail?.sale.customerName).toBe("Budi Jaya Bangunan");
    expect(detail?.sale.customerLocation).toBe("Cikarang");
    expect(detail?.sale.shippingMethod).toBe("J&T Cargo");
    expect(detail?.items[0].productRef).toBe("SEMEN-GRESIK-50KG");
    expect(detail?.items[0].productNameSnapshot).toBe("Semen Gresik 50kg");
    expect(detail?.items[0].rackNameSnapshot).toBe("Rak A-01");
    expect(detail?.items[0].quantity).toBe(20);
    expect(detail?.items[0].unitSnapshot).toBe("Sak");

    // Strict check: ZERO financial leaks
    const headerAny = detail?.sale as any;
    expect(headerAny.total).toBeUndefined();
    expect(headerAny.paymentMethod).toBeUndefined();
    expect(headerAny.rekeningId).toBeUndefined();
    expect(headerAny.rekeningNameSnapshot).toBeUndefined();

    const itemAny = detail?.items[0] as any;
    expect(itemAny.unitPrice).toBeUndefined();
    expect(itemAny.discount).toBeUndefined();
    expect(itemAny.subtotal).toBeUndefined();
  });

  it("3. Handles assignment to Petugas DO", async () => {
    const { assignDeliveryOrder } = await import("@/lib/deliveryOrders/store");

    mocks.deliveryOrder.findFirst.mockResolvedValue({ id: "do-1", salesRecordId: "sale-1" });
    mocks.deliveryOrder.update.mockResolvedValue({ id: "do-1", assignedUserId: "driver-1", assignedUserName: "Pak Supardi" });

    const result = await assignDeliveryOrder("do-1", "driver-1", "Pak Supardi");

    expect(result.assignedUserId).toBe("driver-1");
    expect(result.assignedUserName).toBe("Pak Supardi");
    expect(mocks.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-1" },
      data: {
        doAssignedUserId: "driver-1",
        doAssignedUserName: "Pak Supardi"
      }
    });
  });

  it("4. Handles update packing to 'sudah'", async () => {
    const { updateDeliveryOrderPacking } = await import("@/lib/deliveryOrders/store");

    mocks.deliveryOrder.findFirst.mockResolvedValue({ id: "do-1", salesRecordId: "sale-1", items: [] });
    mocks.deliveryOrder.update.mockResolvedValue({ id: "do-1", packingStatus: "sudah" });

    const result = await updateDeliveryOrderPacking("do-1", ["item-1"]);

    expect(result.packingStatus).toBe("sudah");
    expect(mocks.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-1" },
      data: {
        doPackingStatus: "sudah"
      }
    });
  });

  it("5. Partial shipping transitions status to 'selesai_setengah'", async () => {
    const { completeDeliveryOrderShipping } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-partial",
      salesRecordId: "sale-partial",
      items: [{ id: "item-1" }, { id: "item-2" }]
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockDo);
    mocks.deliveryOrder.update.mockImplementation(({ data }: any) => ({
      ...mockDo,
      ...data
    }));

    const result = await completeDeliveryOrderShipping(
      "do-partial",
      { shippedItemIds: ["item-1"], notes: "Kirim parsial" },
      { id: "driver-1", name: "Pak Supardi", role: "DELIVERY_DRIVER" } as any
    );

    expect(result.status).toBe("selesai_setengah");
    expect(result.packingStatus).toBe("sudah");
    expect(result.shippingStatus).toBe("sudah");
    expect(mocks.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-partial" },
      data: expect.objectContaining({
        doStatus: "selesai_setengah",
        doPackingStatus: "sudah",
        doShippingStatus: "sudah"
      })
    });
  });

  it("6. Full shipping with proof of delivery (foto resi) transitions status to 'selesai'", async () => {
    const { completeDeliveryOrderShipping } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-full",
      salesRecordId: "sale-full",
      items: [{ id: "item-1" }, { id: "item-2" }]
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockDo);
    mocks.deliveryOrder.update.mockImplementation(({ data }: any) => ({
      ...mockDo,
      ...data
    }));

    const resiUrl = "https://cloud.aneka-jaya.local/storage/resi-123.jpg";
    const noResi = "JNE-882910";

    const result = await completeDeliveryOrderShipping(
      "do-full",
      {
        shippedItemIds: ["item-1", "item-2"],
        receiptPhotoUrl: resiUrl,
        trackingNumber: noResi
      },
      { id: "driver-1", name: "Pak Supardi", role: "DELIVERY_DRIVER" } as any
    );

    expect(result.status).toBe("selesai");
    expect(result.packingStatus).toBe("sudah");
    expect(result.shippingStatus).toBe("sudah");
    expect(mocks.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-full" },
      data: expect.objectContaining({
        doStatus: "selesai",
        doPackingStatus: "sudah",
        doShippingStatus: "sudah",
        doReceiptPhotoUrl: resiUrl,
        doTrackingNumber: noResi
      })
    });
  });
});

describe("Regression Testing: Roles & Permissions Integrity", () => {
  it("Verifies role permissions for DELIVERY_DRIVER", async () => {
    const { can, landingPageForRole, roleLabel } = await import("@/lib/auth/roles");

    expect(roleLabel("DELIVERY_DRIVER")).toBe("Petugas DO");
    expect(landingPageForRole("DELIVERY_DRIVER")).toBe("/delivery-orders");

    // Petugas DO must only have do permissions
    expect(can("DELIVERY_DRIVER", "do.view")).toBe(true);
    expect(can("DELIVERY_DRIVER", "do.process")).toBe(true);
    expect(can("DELIVERY_DRIVER", "do.assign")).toBe(false);
    expect(can("DELIVERY_DRIVER", "penjualan.create")).toBe(false);
    expect(can("DELIVERY_DRIVER", "pengeluaran.view")).toBe(false);
    expect(can("DELIVERY_DRIVER", "stock.manage")).toBe(false);
    expect(can("DELIVERY_DRIVER", "reports.view")).toBe(false);
    expect(can("DELIVERY_DRIVER", "settings.view")).toBe(false);
  });

  it("Verifies role permissions for ADMIN and SUPERVISOR regarding DO", async () => {
    const { can } = await import("@/lib/auth/roles");

    // Admin can assign and process DO
    expect(can("ADMIN", "do.view")).toBe(true);
    expect(can("ADMIN", "do.process")).toBe(true);
    expect(can("ADMIN", "do.assign")).toBe(true);

    // Supervisor has DO permissions
    expect(can("SUPERVISOR", "do.view")).toBe(true);
    expect(can("SUPERVISOR", "do.process")).toBe(true);
    expect(can("SUPERVISOR", "do.assign")).toBe(true);

    // Finance does not have DO processing permissions
    expect(can("FINANCE", "do.view")).toBe(false);
    expect(can("FINANCE", "do.process")).toBe(false);
  });
});
