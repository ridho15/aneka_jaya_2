import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Sale } from "@/lib/types/sales";
import { DeliveryOrderBadges, DeliveryStatusBadge } from "@/components/transactions/SalesHistoryList";
import { DeliveryOrderQueueTable } from "@/components/deliveryOrders/DeliveryOrderQueueTable";
import type { DeliveryOrderQueueItem } from "@/lib/deliveryOrders/types";

vi.mock("@/lib/db/prisma", () => {
  const mockTx = {
    deliveryOrder: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    deliveryOrderItem: {
      updateMany: vi.fn()
    },
    salesRecord: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    user: {
      findMany: vi.fn()
    }
  };

  return {
    prisma: {
      ...mockTx,
      $transaction: vi.fn(async (callback) => callback(mockTx))
    }
  };
});

vi.mock("@/lib/audit/store", () => ({
  recordAudit: vi.fn().mockResolvedValue({})
}));

describe("Delivery Order UI Badges", () => {
  const baseSale: Sale = {
    id: "S-12345",
    saleDate: "2026-09-05",
    customerName: "Budi Santoso",
    paymentMethod: "Cash",
    total: 250000,
    items: [],
    doStatus: "belum_selesai",
    doPackingStatus: "belum",
    doShippingStatus: "belum"
  };

  it("renders single progressive 'Belum Diproses' badge when DO is not yet packed", () => {
    const html = renderToStaticMarkup(<DeliveryOrderBadges sale={baseSale} />);
    expect(html).toContain("Belum Diproses");
    expect(html).not.toContain("Packing: Belum");
    expect(html).not.toContain("Kirim: Belum");
    expect(html).not.toContain("📷 Resi");
  });

  it("renders single progressive 'Siap Kirim' badge when items are packed but not yet shipped", () => {
    const readySale: Sale = {
      ...baseSale,
      doPackingStatus: "sudah",
      doShippingStatus: "belum"
    };
    const html = renderToStaticMarkup(<DeliveryOrderBadges sale={readySale} />);
    expect(html).toContain("Siap Kirim");
    expect(html).not.toContain("Packing:");
    expect(html).not.toContain("Kirim:");
  });

  it("renders single progressive 'Selesai Sebagian' badge when DO status is partial", () => {
    const partialSale: Sale = {
      ...baseSale,
      doStatus: "selesai_setengah",
      doPackingStatus: "sudah",
      doShippingStatus: "sudah"
    };
    const html = renderToStaticMarkup(<DeliveryOrderBadges sale={partialSale} />);
    expect(html).toContain("Selesai Sebagian");
    expect(html).not.toContain("Packing:");
    expect(html).not.toContain("Kirim:");
  });

  it("renders single progressive 'Selesai' badge and receipt photo link when completed", () => {
    const completedSale: Sale = {
      ...baseSale,
      doStatus: "selesai",
      doPackingStatus: "sudah",
      doShippingStatus: "sudah",
      doReceiptPhotoUrl: "https://storage.example.com/receipt-123.jpg"
    };
    const html = renderToStaticMarkup(<DeliveryOrderBadges sale={completedSale} />);
    expect(html).toContain("Selesai");
    expect(html).not.toContain("Packing:");
    expect(html).not.toContain("Kirim:");
    expect(html).toContain("📷 Resi");
    expect(html).toContain('href="https://storage.example.com/receipt-123.jpg"');
  });
});

describe("Delivery Order Store Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates DO record and updates SalesRecord denormalized fields", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { createDeliveryOrderForSale } = await import("@/lib/deliveryOrders/store");

    const mockSale = {
      id: "sale-100",
      transactionNumber: "050926-01",
      customerName: "Toko Abadi",
      items: [
        {
          id: "item-1",
          productRef: "BRG-1",
          quantity: 5,
          manualProduct: JSON.stringify({ name: "Barang 1" }),
          warehouseNameSnapshot: "Gudang Utama",
          rackNameSnapshot: "Rak A-01",
          unitSnapshot: "Dus"
        }
      ]
    };

    (prisma.deliveryOrder.findUnique as any).mockResolvedValue(null);
    (prisma.salesRecord.findUnique as any).mockResolvedValue(mockSale);
    (prisma.deliveryOrder.create as any).mockImplementation(({ data }: any) => ({
      id: "do-100",
      ...data
    }));

    const result = await createDeliveryOrderForSale("sale-100");

    expect(result.doNumber).toBe("DO-050926-01");
    expect(prisma.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-100" },
      data: {
        doStatus: "belum_selesai",
        doPackingStatus: "belum",
        doShippingStatus: "belum"
      }
    });
  });

  it("marks DO as 'selesai' when all items are shipped", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { completeDeliveryOrderShipping } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-100",
      salesRecordId: "sale-100",
      items: [{ id: "do-item-1" }, { id: "do-item-2" }]
    };

    (prisma.deliveryOrder.findFirst as any).mockResolvedValue(mockDo);
    (prisma.deliveryOrder.update as any).mockImplementation(({ data }: any) => ({
      ...mockDo,
      ...data
    }));

    const result = await completeDeliveryOrderShipping(
      "do-100",
      {
        shippedItemIds: ["do-item-1", "do-item-2"],
        receiptPhotoUrl: "https://example.com/resi.jpg",
        trackingNumber: "JNE-123"
      },
      { id: "user-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any
    );

    expect(result.status).toBe("selesai");
    expect(result.packingStatus).toBe("sudah");
    expect(result.shippingStatus).toBe("sudah");
    expect(prisma.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-100" },
      data: expect.objectContaining({
        doStatus: "selesai",
        doPackingStatus: "sudah",
        doShippingStatus: "sudah",
        doReceiptPhotoUrl: "https://example.com/resi.jpg",
        doTrackingNumber: "JNE-123"
      })
    });
  });

  it("marks DO as 'selesai_setengah' when only partial items are shipped", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { completeDeliveryOrderShipping } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-100",
      salesRecordId: "sale-100",
      items: [{ id: "do-item-1" }, { id: "do-item-2" }]
    };

    (prisma.deliveryOrder.findFirst as any).mockResolvedValue(mockDo);
    (prisma.deliveryOrder.update as any).mockImplementation(({ data }: any) => ({
      ...mockDo,
      ...data
    }));

    const result = await completeDeliveryOrderShipping(
      "do-100",
      {
        shippedItemIds: ["do-item-1"]
      },
      { id: "user-1", name: "Driver 1", role: "DELIVERY_DRIVER" } as any
    );

    expect(result.status).toBe("selesai_setengah");
    expect(result.packingStatus).toBe("sudah");
    expect(result.shippingStatus).toBe("sudah");
    expect(prisma.salesRecord.update).toHaveBeenCalledWith({
      where: { id: "sale-100" },
      data: expect.objectContaining({
        doStatus: "selesai_setengah",
        doPackingStatus: "sudah",
        doShippingStatus: "sudah"
      })
    });
  });

  it("strictly masks financial/pricing fields in getDeliveryOrderDetail", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { getDeliveryOrderDetail } = await import("@/lib/deliveryOrders/store");

    const mockDo = {
      id: "do-100",
      doNumber: "DO-050926-01",
      salesRecordId: "sale-100",
      status: "belum_selesai",
      packingStatus: "belum",
      shippingStatus: "belum",
      createdAt: new Date(),
      updatedAt: new Date(),
      salesRecord: {
        id: "sale-100",
        transactionNumber: "050926-01",
        saleDate: new Date("2026-09-05"),
        customerName: "Toko Sejahtera",
        customerLocation: "Jl. Sudirman No 10",
        shippingMethod: "JNE Cargo",
        deliveryAt: null
      },
      items: [
        {
          id: "item-1",
          deliveryOrderId: "do-100",
          salesRecordItemId: "sri-1",
          productRef: "SKU-ABC",
          productNameSnapshot: "Semen Portland",
          warehouseNameSnapshot: "Gudang Utama",
          rackNameSnapshot: "Rak B-2",
          unitSnapshot: "Sak",
          quantity: 20,
          isShipped: false,
          shippedQuantity: 0,
          shippedAt: null
        }
      ]
    };

    (prisma.deliveryOrder.findFirst as any).mockResolvedValue(mockDo);

    const detail = await getDeliveryOrderDetail("do-100");
    expect(detail).not.toBeNull();

    // Verify header fields present
    expect(detail?.sale.customerName).toBe("Toko Sejahtera");
    expect(detail?.sale.customerLocation).toBe("Jl. Sudirman No 10");
    expect(detail?.sale.shippingMethod).toBe("JNE Cargo");

    // Verify item fields present
    expect(detail?.items[0].productRef).toBe("SKU-ABC");
    expect(detail?.items[0].productNameSnapshot).toBe("Semen Portland");
    expect(detail?.items[0].rackNameSnapshot).toBe("Rak B-2");
    expect(detail?.items[0].quantity).toBe(20);
    expect(detail?.items[0].unitSnapshot).toBe("Sak");

    // Verify financial fields are NOT present
    expect((detail?.sale as any).total).toBeUndefined();
    expect((detail?.sale as any).paymentMethod).toBeUndefined();
    expect((detail?.items[0] as any).unitPrice).toBeUndefined();
    expect((detail?.items[0] as any).discount).toBeUndefined();
    expect((detail?.items[0] as any).subtotal).toBeUndefined();
  });
});

describe("DeliveryOrderQueueTable UI", () => {
  const sampleOfficers = [
    { id: "officer-1", name: "Pak Budi", role: "DELIVERY_DRIVER" },
    { id: "officer-2", name: "Pak Joko", role: "DELIVERY_DRIVER" }
  ];

  const sampleItem: DeliveryOrderQueueItem = {
    id: "do-1",
    doNumber: "DO-2026-001",
    salesRecordId: "sale-1",
    transactionNumber: "TRX-001",
    saleDate: "2026-09-06T10:00:00Z",
    customerName: "Toko Sinar Mulia",
    customerLocation: "Jakarta Barat",
    shippingMethod: "Kurir Toko",
    status: "belum_selesai",
    packingStatus: "belum",
    shippingStatus: "belum",
    totalItemsCount: 3,
    shippedItemsCount: 0,
    createdAt: "2026-09-06T10:00:00Z"
  };

  it("renders empty state when queue is empty", () => {
    const html = renderToStaticMarkup(
      <DeliveryOrderQueueTable
        initialQueue={[]}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserId="admin-1"
        currentUserRole="ADMIN"
      />
    );

    expect(html).toContain("Tidak ada Delivery Order yang sesuai filter pencarian.");
  });

  it("renders DO item details and links correctly", () => {
    const html = renderToStaticMarkup(
      <DeliveryOrderQueueTable
        initialQueue={[sampleItem]}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserId="admin-1"
        currentUserRole="ADMIN"
      />
    );

    expect(html).toContain("DO-2026-001");
    expect(html).toContain("Toko Sinar Mulia");
    expect(html).toContain("Jakarta Barat");
    expect(html).toContain("Kurir Toko");
    expect(html).toContain("Proses DO");
    expect(html).toContain('href="/delivery-orders/do-1"');
  });
});
