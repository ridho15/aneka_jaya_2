import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types/product";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const stockAlertLog = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn()
  };

  return {
    stockAlertLog,
    prisma: {
      stockAlertLog
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

vi.mock("@/lib/audit/store", () => ({
  recordAudit: vi.fn().mockResolvedValue({})
}));

vi.mock("@/lib/whatsapp/whatsappClient", () => ({
  listWhatsappRecipients: vi.fn().mockResolvedValue([
    { id: "rcp-1", name: "Pak Admin", phoneNumber: "628123456789", isActive: true, receivesStockAlert: true }
  ]),
  sendWhatsappMessage: vi.fn().mockResolvedValue({ status: "sent" })
}));

describe("Stock Alerts PostgreSQL Store (checkStockMinimumAlert & listStockAlertLogs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when stock or minimumStock is invalid or non-positive", async () => {
    const { checkStockMinimumAlert } = await import("@/lib/stockAlerts/store");

    const invalidProduct = {
      id: "prod-1",
      code: "SKU-01",
      name: "Barang Test",
      initialStock: 10,
      minimumStock: 0
    } as Product;

    const result = await checkStockMinimumAlert(invalidProduct);
    expect(result).toBeNull();
    expect(mocks.stockAlertLog.findFirst).not.toHaveBeenCalled();
    expect(mocks.stockAlertLog.create).not.toHaveBeenCalled();
  });

  it("updates existing open alert to 'resolved' when currentStock > minimumStock", async () => {
    const { checkStockMinimumAlert } = await import("@/lib/stockAlerts/store");

    mocks.stockAlertLog.findFirst.mockResolvedValue({
      id: "SAL-OPEN-1",
      productRef: "SKU-01",
      productName: "Barang Test",
      currentQuantity: 2,
      minimumQuantity: 10,
      status: "sent",
      sentTo: "Pak Admin",
      createdAt: new Date("2026-09-06T10:00:00Z")
    });

    const recoveredProduct = {
      id: "prod-1",
      code: "SKU-01",
      name: "Barang Test",
      quantity: 15,
      minimumStock: 10
    } as any;

    const result = await checkStockMinimumAlert(recoveredProduct);

    expect(result).toBeNull();
    expect(mocks.stockAlertLog.updateMany).toHaveBeenCalledWith({
      where: {
        productRef: "SKU-01",
        status: { not: "resolved" }
      },
      data: {
        status: "resolved"
      }
    });
  });

  it("deduplicates alert and avoids sending redundant WA when an open alert already exists", async () => {
    const { checkStockMinimumAlert } = await import("@/lib/stockAlerts/store");
    const { sendWhatsappMessage } = await import("@/lib/whatsapp/whatsappClient");

    const openAlertRow = {
      id: "SAL-OPEN-1",
      productRef: "SKU-LOW",
      productName: "Semen Portland",
      currentQuantity: 3,
      minimumQuantity: 10,
      status: "sent",
      sentTo: "628123456789",
      createdAt: new Date("2026-09-07T08:00:00Z")
    };

    mocks.stockAlertLog.findFirst.mockResolvedValue(openAlertRow);

    const lowProduct = {
      id: "prod-low",
      productCode: "SKU-LOW",
      productName: "Semen Portland",
      quantity: 2,
      minimumStock: 10
    } as any;

    const result = await checkStockMinimumAlert(lowProduct);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("SAL-OPEN-1");
    expect(result?.status).toBe("sent");
    // Crucial: no new WA message must be sent
    expect(sendWhatsappMessage).not.toHaveBeenCalled();
    expect(mocks.stockAlertLog.create).not.toHaveBeenCalled();
  });

  it("creates a new alert and sends WA when stock is low and no open alert exists", async () => {
    const { checkStockMinimumAlert } = await import("@/lib/stockAlerts/store");
    const { sendWhatsappMessage } = await import("@/lib/whatsapp/whatsappClient");
    const { recordAudit } = await import("@/lib/audit/store");

    mocks.stockAlertLog.findFirst.mockResolvedValue(null);

    mocks.stockAlertLog.create.mockImplementation(({ data }: any) => ({
      ...data,
      createdAt: new Date("2026-09-07T09:00:00Z")
    }));

    const criticalProduct = {
      id: "prod-crit",
      code: "SKU-CRIT-99",
      name: "Cat Tembok Putih",
      initialStock: 1,
      minimumStock: 5,
      warehouse: "Gudang Utama",
      rack: "Rak B-01"
    } as any;

    const result = await checkStockMinimumAlert(criticalProduct);

    expect(result).not.toBeNull();
    expect(result?.productCodeSnapshot).toBe("SKU-CRIT-99");
    expect(result?.status).toBe("sent");
    expect(result?.warehouseSnapshot).toBe("Gudang Utama");
    expect(result?.rackSnapshot).toBe("Rak B-01");

    expect(sendWhatsappMessage).toHaveBeenCalledTimes(1);
    expect(mocks.stockAlertLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productRef: "SKU-CRIT-99",
          productName: "Cat Tembok Putih",
          currentQuantity: 1,
          minimumQuantity: 5,
          status: "sent",
          sentTo: "628123456789"
        })
      })
    );

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "stock_alert",
        action: "send_whatsapp"
      })
    );
  });

  it("listStockAlertLogs queries PostgreSQL with desc order and maps results", async () => {
    const { listStockAlertLogs } = await import("@/lib/stockAlerts/store");

    const sampleDbRows = [
      {
        id: "SAL-1",
        productRef: "SKU-A",
        productName: "Produk A",
        currentQuantity: 2,
        minimumQuantity: 10,
        status: "resolved",
        sentTo: "WA",
        createdAt: new Date("2026-09-07T07:00:00Z")
      },
      {
        id: "SAL-2",
        productRef: "SKU-B",
        productName: "Produk B",
        currentQuantity: 0,
        minimumQuantity: 8,
        status: "sent",
        sentTo: "WA",
        createdAt: new Date("2026-09-07T08:00:00Z")
      }
    ];

    mocks.stockAlertLog.findMany.mockResolvedValue(sampleDbRows);

    const logs = await listStockAlertLogs();

    expect(mocks.stockAlertLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" }
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].productCodeSnapshot).toBe("SKU-A");
    expect(logs[1].productCodeSnapshot).toBe("SKU-B");
    expect(logs[1].status).toBe("sent");
  });
});
