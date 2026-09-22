import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Sale } from "@/lib/types/sales";
import { DeliveryOrderBadges, DeliveryStatusBadge } from "@/components/transactions/SalesHistoryList";
import { DeliveryOrderQueueTable } from "@/components/deliveryOrders/DeliveryOrderQueueTable";
import { DeliveryOrderDetailView } from "@/components/deliveryOrders/DeliveryOrderDetailView";
import type { DeliveryOrderQueueItem } from "@/lib/deliveryOrders/types";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

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
    deliveryOrderAssignee: {
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn()
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

  it("renders DO item details and links correctly, with DO number only visible to OWNER", () => {
    // Non-owner (ADMIN) should NOT see DO-2026-001
    const adminHtml = renderToStaticMarkup(
      <DeliveryOrderQueueTable
        initialQueue={[sampleItem]}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserId="admin-1"
        currentUserRole="ADMIN"
      />
    );

    expect(adminHtml).not.toContain("DO-2026-001");
    expect(adminHtml).toContain("Inv: TRX-001");
    expect(adminHtml).toContain("Toko Sinar Mulia");
    expect(adminHtml).toContain("Jakarta Barat");
    expect(adminHtml).toContain("Kurir Toko");
    expect(adminHtml).toContain("Proses DO");
    expect(adminHtml).toContain('href="/delivery-orders/do-1"');

    // Owner should see DO-2026-001
    const ownerHtml = renderToStaticMarkup(
      <DeliveryOrderQueueTable
        initialQueue={[sampleItem]}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserId="owner-1"
        currentUserRole="OWNER"
      />
    );

    expect(ownerHtml).toContain("DO-2026-001");
    expect(ownerHtml).toContain("Inv: TRX-001");
  });

  it("renders multiple assigned officers if present", () => {
    const multiItem: DeliveryOrderQueueItem = {
      ...sampleItem,
      assignedOfficers: [
        { id: "ao-1", userId: "officer-1", userName: "Pak Budi", assignedAt: "2026-09-06T10:00:00Z" },
        { id: "ao-2", userId: "officer-2", userName: "Pak Joko", assignedAt: "2026-09-06T10:00:00Z" }
      ]
    };

    const html = renderToStaticMarkup(
      <DeliveryOrderQueueTable
        initialQueue={[multiItem]}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserId="driver-1"
        currentUserRole="DELIVERY_DRIVER"
      />
    );

    expect(html).toContain("Pak Budi");
    expect(html).toContain("Pak Joko");
  });
});

describe("DeliveryOrderDetailView UI", () => {
  const sampleOfficers = [
    { id: "officer-1", name: "Pak Budi", role: "DELIVERY_DRIVER" },
    { id: "officer-2", name: "Pak Joko", role: "DELIVERY_DRIVER" }
  ];

  const sampleDetail: DeliveryOrderData = {
    id: "do-100",
    doNumber: "DO-2026-100",
    salesRecordId: "sale-100",
    status: "belum_selesai",
    packingStatus: "belum",
    shippingStatus: "belum",
    sale: {
      id: "sale-100",
      transactionNumber: "TRX-100",
      customerName: "Toko Berkah",
      customerLocation: "Jakarta",
      shippingMethod: "Kurir Toko",
      saleDate: "2026-09-07"
    },
    items: [
      {
        id: "item-1",
        deliveryOrderId: "do-100",
        salesRecordItemId: "sri-1",
        productRef: "SKU-01",
        productNameSnapshot: "Semen Portland",
        quantity: 10,
        unitSnapshot: "Sak",
        isShipped: false,
        shippedQuantity: 0
      },
      {
        id: "item-2",
        deliveryOrderId: "do-100",
        salesRecordItemId: "sri-2",
        productRef: "SKU-02",
        productNameSnapshot: "Besi Beton",
        quantity: 5,
        unitSnapshot: "Batang",
        isShipped: false,
        shippedQuantity: 0
      }
    ],
    createdAt: "2026-09-07T08:00:00Z",
    updatedAt: "2026-09-07T08:00:00Z"
  };

  it("does not auto-check item checkboxes by default on initial render", () => {
    const html = renderToStaticMarkup(
      <DeliveryOrderDetailView
        initialDetail={sampleDetail}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserRole="ADMIN"
      />
    );

    // Initial summary text shows 0 selected
    expect(html).toContain("(0 dari 2 dipilih)");

    // Button to select all is labeled "Pilih Semua Barang"
    expect(html).toContain("Pilih Semua Barang");

    // Ship button is disabled when 0 items are selected
    expect(html).toContain("disabled");

    // Number column header and row numbers are rendered
    expect(html).toContain(">No</th>");
    expect(html).toContain(">1</td>");
    expect(html).toContain(">2</td>");
  });


  it("masks DO number for non-owner roles and displays it only for OWNER", () => {
    // DELIVERY_DRIVER view
    const driverHtml = renderToStaticMarkup(
      <DeliveryOrderDetailView
        initialDetail={sampleDetail}
        officers={sampleOfficers}
        canAssign={false}
        canProcess={true}
        currentUserRole="DELIVERY_DRIVER"
      />
    );

    expect(driverHtml).not.toContain("DO-2026-100");
    expect(driverHtml).toContain("Surat Jalan (Inv: TRX-100)");
    expect(driverHtml).toContain("Toko Berkah");
    expect(driverHtml).toContain("Jakarta");
    expect(driverHtml).toContain("Kurir Toko");

    // OWNER view
    const ownerHtml = renderToStaticMarkup(
      <DeliveryOrderDetailView
        initialDetail={sampleDetail}
        officers={sampleOfficers}
        canAssign={true}
        canProcess={true}
        currentUserRole="OWNER"
      />
    );

    expect(ownerHtml).toContain("DO-2026-100");
    expect(ownerHtml).toContain("TRX-100");
  });
});
