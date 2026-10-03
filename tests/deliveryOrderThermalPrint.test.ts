import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import {
  generateDeliveryOrderThermalText,
  generateDeliveryOrderEscPos,
  generateRawBtUrl,
  THERMAL_80MM_WIDTH
} from "@/lib/print/thermalEscpos";

const mockDoData: DeliveryOrderData = {
  id: "do-thermal-001",
  doNumber: "DO-20261003-0001",
  salesRecordId: "sale-101",
  status: "belum_selesai",
  packingStatus: "sudah",
  shippingStatus: "belum",
  assignedUserId: "driver-1",
  assignedUserName: "Pak Supardi",
  shippedByNameSnapshot: "Pak Supardi (Kurir)",
  trackingNumber: "TRK-987654",
  notes: "Tolong kirim sebelum jam 4 sore",
  createdAt: "2026-10-03T08:00:00.000Z",
  updatedAt: "2026-10-03T08:30:00.000Z",
  sale: {
    id: "sale-101",
    transactionNumber: "INV-202610-0088",
    saleDate: "2026-10-03",
    customerName: "Toko Maju Jaya Abadi",
    customerLocation: "Jl. Industri Raya No. 45, Cikarang",
    shippingMethod: "Kurir Toko (Mobil Box)",
    deliveryAt: "2026-10-03"
  },
  items: [
    {
      id: "item-1",
      deliveryOrderId: "do-thermal-001",
      salesRecordItemId: "sri-1",
      productRef: "SENG-GEL-03",
      productNameSnapshot: "Seng Gelombang 0.3mm",
      warehouseNameSnapshot: "Gudang Utama",
      rackNameSnapshot: "RAK-B2",
      unitSnapshot: "LBR",
      quantity: 25,
      isShipped: false,
      shippedQuantity: 0
    },
    {
      id: "item-2",
      deliveryOrderId: "do-thermal-001",
      salesRecordItemId: "sri-2",
      productRef: "PAKU-SENG-25",
      productNameSnapshot: "Paku Seng Payung 2.5 Inch",
      warehouseNameSnapshot: "Gudang Utama",
      rackNameSnapshot: "RAK-A1",
      unitSnapshot: "DUS",
      quantity: 3,
      isShipped: false,
      shippedQuantity: 0
    }
  ]
};

describe("Delivery Order Thermal 80mm Printing", () => {
  describe("generateDeliveryOrderThermalText", () => {
    it("generates 48-column thermal text with jumbo customer and invoice headers", () => {
      const text = generateDeliveryOrderThermalText(mockDoData);

      // Verify Customer Name is prominent and uppercase
      expect(text).toContain("TOKO MAJU JAYA ABADI");

      // Verify Invoice and DO numbers
      expect(text).toContain("INVOICE: INV-202610-0088");
      expect(text).toContain("DO: DO-20261003-0001");

      // Verify Delivery information
      expect(text).toContain("Kurir Toko (Mobil Box)");
      expect(text).toContain("Jl. Industri Raya No. 45,");
      expect(text).toContain("Cikarang");
      expect(text).toContain("TRK-987654");
      expect(text).toContain("Pak Supardi (Kurir)");

      // Verify Items and Rack locations
      expect(text).toContain("Seng Gelombang 0.3mm");
      expect(text).toContain("25 LBR");
      expect(text).toContain("RAK-B2");

      expect(text).toContain("Paku Seng Payung 2.5 Inch");
      expect(text).toContain("3 DUS");
      expect(text).toContain("RAK-A1");

      // Verify Notes and Signatures
      expect(text).toContain("Tolong kirim sebelum jam 4 sore");
      expect(text).toContain("Pengirim / Sopir");
      expect(text).toContain("Penerima / Toko");

      // Strictly masked: Verify NO prices or Rupiah signs exist
      expect(text).not.toContain("Rp");
      expect(text).not.toContain("Harga");
      expect(text).not.toContain("Total Bayar");
    });

    it("ensures lines fit within standard 48-column thermal width limit", () => {
      const text = generateDeliveryOrderThermalText(mockDoData);
      const lines = text.split("\n");

      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(THERMAL_80MM_WIDTH);
      }
    });
  });

  describe("generateDeliveryOrderEscPos", () => {
    it("generates valid ESC/POS byte sequence with maximum size scaling for customer and invoice", () => {
      const bytes = generateDeliveryOrderEscPos(mockDoData);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(100);

      // Verify ESC @ (Initialize: 0x1B, 0x40)
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // Convert bytes to string to inspect command sequences
      const binaryString = new TextDecoder("latin1").decode(bytes);

      // Verify customer name is present
      expect(binaryString).toContain("TOKO MAJU JAYA ABADI");

      // Verify invoice number is present
      expect(binaryString).toContain("INV-202610-0088");

      // GS ! 0x11 (0x1D, 0x21, 0x11) for Long Customer Name (>14 chars)
      expect(binaryString).toContain("\x1D\x21\x11");

      // GS ! 0x11 (0x1D, 0x21, 0x11) for Large Invoice Number
      expect(binaryString).toContain("\x1D\x21\x11");

      // Verify Cut command at the end (GS V 66 0: 0x1D, 0x56, 0x42, 0x00)
      const lastBytes = bytes.slice(-4);
      expect(Array.from(lastBytes)).toEqual([0x1d, 0x56, 0x42, 0x00]);

      // Test short customer name (<= 14 chars) uses Triple size (0x22)
      const shortCustomerDo = {
        ...mockDoData,
        sale: {
          ...mockDoData.sale,
          customerName: "TOKO ABU"
        }
      };
      const shortBytes = generateDeliveryOrderEscPos(shortCustomerDo);
      const shortBinaryString = new TextDecoder("latin1").decode(shortBytes);
      expect(shortBinaryString).toContain("\x1D\x21\x22");
    });
  });

  describe("generateRawBtUrl", () => {
    it("generates an Android RawBT intent URL starting with rawbt:data:base64,", () => {
      const url = generateRawBtUrl(mockDoData);

      expect(url.startsWith("rawbt:data:base64,")).toBe(true);
      expect(url.length).toBeGreaterThan(50);
    });
  });
});
