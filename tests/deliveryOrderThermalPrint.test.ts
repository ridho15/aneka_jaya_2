import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import {
  generateDeliveryOrderThermalText,
  generateDeliveryOrderEscPos,
  generateRawBtUrl,
  getDeliveryOrderSourceLabel
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

const mockMjDoData: DeliveryOrderData = {
  ...mockDoData,
  sale: {
    ...mockDoData.sale,
    source: "MJ",
    createdByUserId: "integration:mj"
  }
};

describe("Delivery Order Thermal 80mm Printing (Minimal Landscape)", () => {
  describe("getDeliveryOrderSourceLabel", () => {
    it("returns 'SIP' for default internal Aneka Jaya orders", () => {
      expect(getDeliveryOrderSourceLabel(mockDoData)).toBe("SIP");
    });

    it("returns 'MJ' for orders originating from mj.playgo.id", () => {
      expect(getDeliveryOrderSourceLabel(mockMjDoData)).toBe("MJ");
    });
  });

  describe("generateDeliveryOrderThermalText", () => {
    it("generates minimal text containing invoice number, customer name, and default SIP source indicator", () => {
      const text = generateDeliveryOrderThermalText(mockDoData);

      // Verify exact raw values exist
      expect(text).toContain("INV-202610-0088");
      expect(text).toContain("TOKO MAJU JAYA ABADI");
      expect(text).toContain("SIP");

      // Verify NO labels or extra info exist
      expect(text).not.toContain("INVOICE:");
      expect(text).not.toContain("DO:");
      expect(text).not.toContain("PELANGGAN");
      expect(text).not.toContain("SURAT JALAN");
      expect(text).not.toContain("RINCIAN BARANG");
      expect(text).not.toContain("RAK");
      expect(text).not.toContain("Tanda Tangan");
      expect(text).not.toContain("Rp");
      expect(text).not.toContain("Pak Supardi");
      expect(text).not.toContain("STATUS");
    });

    it("generates text containing 'MJ' for orders originating from mj.playgo.id", () => {
      const text = generateDeliveryOrderThermalText(mockMjDoData);

      expect(text).toContain("INV-202610-0088");
      expect(text).toContain("TOKO MAJU JAYA ABADI");
      expect(text).toContain("MJ");
      expect(text).not.toContain("SIP");
    });
  });

  describe("generateDeliveryOrderEscPos", () => {
    it("generates valid ESC/POS byte sequence with center alignment, bold scaling, and SIP source label", () => {
      const bytes = generateDeliveryOrderEscPos(mockDoData);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(20);

      // Verify ESC @ (Initialize: 0x1B, 0x40)
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // Convert bytes to string to inspect command sequences
      const binaryString = new TextDecoder("latin1").decode(bytes);

      // Verify customer name is present
      expect(binaryString).toContain("TOKO MAJU JAYA ABADI");

      // Verify invoice number is present
      expect(binaryString).toContain("INV-202610-0088");

      // Verify source indicator SIP is present
      expect(binaryString).toContain("SIP");

      // Verify ESC a 1 (0x1B, 0x61, 0x01) center alignment
      expect(binaryString).toContain("\x1b\x61\x01");

      // Verify ESC E 1 (0x1B, 0x45, 0x01) bold command
      expect(binaryString).toContain("\x1b\x45\x01");

      // Verify ESC G 1 (0x1B, 0x47, 0x01) double-strike bold command
      expect(binaryString).toContain("\x1b\x47\x01");

      // Verify GS ! (0x1D, 0x21) font scaling command
      expect(binaryString).toContain("\x1d\x21");

      // Verify Cut command at the end (GS V 66 0: 0x1D, 0x56, 0x42, 0x00)
      const lastBytes = bytes.slice(-4);
      expect(Array.from(lastBytes)).toEqual([0x1d, 0x56, 0x42, 0x00]);

      // Verify NO unwanted headers or labels in binary payload
      expect(binaryString).not.toContain("SURAT JALAN");
      expect(binaryString).not.toContain("RINCIAN BARANG");
      expect(binaryString).not.toContain("Rp");
    });

    it("generates ESC/POS byte sequence with 'MJ' label for MJ integration order", () => {
      const bytes = generateDeliveryOrderEscPos(mockMjDoData);
      const binaryString = new TextDecoder("latin1").decode(bytes);

      expect(binaryString).toContain("MJ");
      expect(binaryString).not.toContain("SIP");
    });
  });

  describe("generateRawBtUrl", () => {
    it("generates an Android RawBT intent URL starting with rawbt:data:base64,", () => {
      const url = generateRawBtUrl(mockDoData);

      expect(url.startsWith("rawbt:data:base64,")).toBe(true);
      expect(url.length).toBeGreaterThan(30);
    });
  });
});
