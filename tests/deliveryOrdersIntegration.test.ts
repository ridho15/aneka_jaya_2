import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deliveryOrder = {
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  };
  const deliveryOrderItem = {
    updateMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
  const deliveryOrderAssignee = {
    findFirst: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn()
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
    deliveryOrderAssignee,
    salesRecord,
    user
  };

  return {
    tx,
    deliveryOrder,
    deliveryOrderItem,
    deliveryOrderAssignee,
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

    expect((created as any)?.doNumber).toBe("DO-TRX-050926-01");
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
      {
        shippedItemIds: ["item-1"],
        receiptPhotoUrl: "https://cloud.aneka-jaya.local/storage/resi-parsial.jpg",
        notes: "Kirim parsial"
      },
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
        doShippingStatus: "sudah",
        doReceiptPhotoUrl: "https://cloud.aneka-jaya.local/storage/resi-parsial.jpg"
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

  it("7. listDeliveryOrdersPage returns paginated results with metadata", async () => {
    const { listDeliveryOrdersPage } = await import("@/lib/deliveryOrders/store");

    const mockRow = {
      id: "do-page-1",
      doNumber: "DO-PAGE-01",
      salesRecordId: "sale-page-1",
      status: "belum_selesai",
      packingStatus: "belum",
      shippingStatus: "belum",
      createdAt: new Date("2026-09-06T10:00:00Z"),
      assignedUserId: "driver-1",
      assignedUserName: "Pak Supri",
      receiptPhotoUrl: null,
      salesRecord: {
        transactionNumber: "TRX-PAGE-01",
        saleDate: new Date("2026-09-06T09:30:00Z"),
        customerName: "Toko Berkah",
        customerLocation: "Bekasi Timur",
        shippingMethod: "Ambil Sendiri",
        deliveryAt: null
      },
      items: [{ id: "item-1", isShipped: false }]
    };

    mocks.deliveryOrder.count.mockResolvedValue(25);
    mocks.deliveryOrder.findMany.mockResolvedValue([mockRow]);

    const result = await listDeliveryOrdersPage({
      page: 2,
      pageSize: 10,
      filters: {
        search: "Berkah",
        status: "belum_selesai"
      }
    });

    expect(mocks.deliveryOrder.count).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { status: "belum_selesai" },
            expect.objectContaining({ OR: expect.any(Array) })
          ])
        })
      })
    );

    expect(result.meta).toEqual({
      total: 25,
      totalPages: 3,
      page: 2,
      pageSize: 10
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].doNumber).toBe("DO-PAGE-01");
    expect(result.data[0].customerName).toBe("Toko Berkah");
    expect(result.data[0].assignedUserName).toBe("Pak Supri");
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

  it("Multi-assignee: supports adding and removing additional Petugas DO", async () => {
    const { addDeliveryOrderAssignee, removeDeliveryOrderAssignee } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-multi-1",
      salesRecordId: "sale-multi-1",
      assignedUserId: "driver-1",
      assignedUserName: "Pak Supardi",
      assignees: [
        { id: "asg-1", userId: "driver-1", userName: "Pak Supardi", assignedAt: new Date() }
      ],
      salesRecord: {
        id: "sale-multi-1",
        customerName: "Toko Abadi",
        saleDate: new Date()
      },
      items: []
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockDo);
    mocks.deliveryOrderAssignee.findFirst.mockResolvedValue(null);
    mocks.deliveryOrderAssignee.create.mockResolvedValue({
      id: "asg-2",
      deliveryOrderId: "do-multi-1",
      userId: "driver-2",
      userName: "Pak Joko",
      assignedAt: new Date()
    });

    await addDeliveryOrderAssignee("do-multi-1", "driver-2", "Pak Joko", {
      id: "driver-1",
      name: "Pak Supardi",
      role: "DELIVERY_DRIVER"
    } as any);

    expect(mocks.deliveryOrderAssignee.create).toHaveBeenCalledWith({
      data: {
        deliveryOrderId: "do-multi-1",
        userId: "driver-2",
        userName: "Pak Joko"
      }
    });

    // Remove
    await removeDeliveryOrderAssignee("do-multi-1", "driver-2", {
      id: "driver-1",
      name: "Pak Supardi",
      role: "DELIVERY_DRIVER"
    } as any);

    expect(mocks.deliveryOrderAssignee.deleteMany).toHaveBeenCalledWith({
      where: {
        deliveryOrderId: "do-multi-1",
        userId: "driver-2"
      }
    });
  });

  it("11. Reconciles DO items when DO already exists but has empty items", async () => {
    const { syncDeliveryOrderForSale } = await import("@/lib/deliveryOrders/store");

    const existingDoWithoutItems = {
      id: "do-existing-1",
      doNumber: "DO-TRX-EXISTING",
      salesRecordId: "sale-existing-1",
      status: "belum_selesai",
      packingStatus: "belum",
      shippingStatus: "belum",
      items: []
    };

    const mockSaleWithItems = {
      id: "sale-existing-1",
      transactionNumber: "TRX-EXISTING",
      customerName: "Toko Besi Maju",
      items: [
        {
          id: "item-rec-1",
          productRef: "SEMEN-PADANG-50KG",
          manualProduct: JSON.stringify({ name: "Semen Padang 50kg" }),
          warehouseNameSnapshot: "Gudang Utama",
          rackNameSnapshot: "Area Semen",
          unitSnapshot: "Sak",
          quantity: 25
        }
      ]
    };

    mocks.deliveryOrder.findUnique.mockResolvedValue(existingDoWithoutItems);
    mocks.salesRecord.findUnique.mockResolvedValue(mockSaleWithItems);
    mocks.deliveryOrderItem.deleteMany.mockResolvedValue({ count: 0 });
    mocks.deliveryOrderItem.create.mockImplementation(({ data }: any) => ({
      id: "do-item-rec-1",
      ...data
    }));

    const result = await syncDeliveryOrderForSale("sale-existing-1");

    expect(result).toBeDefined();
    expect(mocks.deliveryOrderItem.deleteMany).toHaveBeenCalledWith({
      where: { deliveryOrderId: "do-existing-1" }
    });
    expect(mocks.deliveryOrderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryOrderId: "do-existing-1",
          productRef: "SEMEN-PADANG-50KG",
          productNameSnapshot: "Semen Padang 50kg",
          quantity: 25,
          unitSnapshot: "Sak"
        })
      })
    );
  });

  it("12. Hides completed DO from non-Super Admin (DELIVERY_DRIVER, ADMIN, SUPERVISOR)", async () => {
    const { listDeliveryOrdersPage } = await import("@/lib/deliveryOrders/store");

    mocks.deliveryOrder.count.mockResolvedValue(0);
    mocks.deliveryOrder.findMany.mockResolvedValue([]);

    const driverUser = { id: "driver-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any;
    const supervisorUser = { id: "spv-1", name: "Spv 1", role: "SUPERVISOR" } as any;

    await listDeliveryOrdersPage({ page: 1, pageSize: 10 }, driverUser);

    expect(mocks.deliveryOrder.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "selesai" }
        }
      })
    );

    await listDeliveryOrdersPage({ page: 1, pageSize: 10 }, supervisorUser);

    expect(mocks.deliveryOrder.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "selesai" }
        }
      })
    );
  });

  it("13. Allows Super Admin (OWNER) to see all DOs including completed", async () => {
    const { listDeliveryOrdersPage } = await import("@/lib/deliveryOrders/store");

    mocks.deliveryOrder.count.mockResolvedValue(0);
    mocks.deliveryOrder.findMany.mockResolvedValue([]);

    const ownerUser = { id: "owner-1", name: "Super Admin", role: "OWNER" } as any;

    await listDeliveryOrdersPage({ page: 1, pageSize: 10 }, ownerUser);

    const callArgs = mocks.deliveryOrder.findMany.mock.calls.at(-1)?.[0];
    const andClauses = callArgs?.where?.AND || [];
    const hasNotCompleted = andClauses.some(
      (clause: any) => clause?.status?.not === "selesai"
    );

    expect(hasNotCompleted).toBe(false);
  });

  it("14. Blocks non-Super Admin (driver & supervisor) from accessing getDeliveryOrderDetail for completed DO", async () => {
    const { getDeliveryOrderDetail } = await import("@/lib/deliveryOrders/store");

    const mockCompletedDo = {
      id: "do-completed-1",
      doNumber: "DO-COMPLETED-01",
      salesRecordId: "sale-completed-1",
      status: "selesai",
      packingStatus: "belum", // Even if packingStatus is not "sudah", status: "selesai" is strictly blocked
      shippingStatus: "sudah",
      createdAt: new Date(),
      updatedAt: new Date(),
      salesRecord: {
        id: "sale-completed-1",
        transactionNumber: "TRX-DONE-01",
        saleDate: new Date(),
        customerName: "Pelanggan Selesai"
      },
      items: [],
      assignees: []
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockCompletedDo);

    const driverUser = { id: "driver-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any;
    const supervisorUser = { id: "spv-1", name: "Spv 1", role: "SUPERVISOR" } as any;
    const ownerUser = { id: "owner-1", name: "Super Admin", role: "OWNER" } as any;

    // Driver cannot access completed DO
    const driverResult = await getDeliveryOrderDetail("do-completed-1", driverUser);
    expect(driverResult).toBeNull();

    // Supervisor cannot access completed DO
    const supervisorResult = await getDeliveryOrderDetail("do-completed-1", supervisorUser);
    expect(supervisorResult).toBeNull();

    // Super Admin (OWNER) can access completed DO
    const ownerResult = await getDeliveryOrderDetail("do-completed-1", ownerUser);
    expect(ownerResult).not.toBeNull();
    expect(ownerResult?.doNumber).toBe("DO-COMPLETED-01");
  });

  it("15. Rejects mutation attempts on completed DOs by non-Super Admin", async () => {
    const {
      assignDeliveryOrder,
      addDeliveryOrderAssignee,
      removeDeliveryOrderAssignee,
      updateDeliveryOrderPacking,
      completeDeliveryOrderShipping
    } = await import("@/lib/deliveryOrders/store");

    const mockCompletedDo = {
      id: "do-completed-guard",
      salesRecordId: "sale-guard",
      status: "selesai",
      packingStatus: "sudah",
      shippingStatus: "sudah",
      items: [{ id: "item-1" }],
      assignees: []
    };

    mocks.deliveryOrder.findFirst.mockResolvedValue(mockCompletedDo);

    const driverUser = { id: "driver-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any;

    await expect(assignDeliveryOrder("do-completed-guard", "driver-2", "Driver 2", driverUser)).rejects.toThrow(
      "Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin."
    );

    await expect(addDeliveryOrderAssignee("do-completed-guard", "driver-2", "Driver 2", driverUser)).rejects.toThrow(
      "Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin."
    );

    await expect(removeDeliveryOrderAssignee("do-completed-guard", "driver-1", driverUser)).rejects.toThrow(
      "Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin."
    );

    await expect(updateDeliveryOrderPacking("do-completed-guard", ["item-1"], driverUser)).rejects.toThrow(
      "Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin."
    );

    await expect(completeDeliveryOrderShipping("do-completed-guard", { shippedItemIds: ["item-1"] }, driverUser)).rejects.toThrow(
      "Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin."
    );
  });

  it("16. Verifies completed DO detection logic for non-Super Admin fallback redirect", async () => {
    const mockCompleted = { id: "do-done", status: "selesai" };
    mocks.deliveryOrder.findFirst.mockResolvedValue(mockCompleted);

    const { getDeliveryOrderDetail } = await import("@/lib/deliveryOrders/store");
    const driverUser = { id: "driver-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any;

    const detail = await getDeliveryOrderDetail("do-done", driverUser);
    expect(detail).toBeNull();

    const existing = await mocks.deliveryOrder.findFirst({
      where: { OR: [{ id: "do-done" }, { salesRecordId: "do-done" }, { doNumber: "do-done" }] },
      select: { id: true, status: true }
    });
    expect(existing).toBeDefined();
    expect(existing?.status).toBe("selesai");
    expect(existing?.status === "selesai" && driverUser.role !== "OWNER").toBe(true);
  });
});
