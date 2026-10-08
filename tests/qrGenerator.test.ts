import { describe, it, expect } from "vitest";
import { generateDeliveryOrderQrPayload, generateQrCodeSvg, generateQrCodeDataUrl } from "@/lib/print/qrGenerator";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";

const mockDoInternal: DeliveryOrderData = {
  id: "do-1",
  doNumber: "DO-202610-001",
  saleId: "sale-1",
  status: "Diproses",
  packingStatus: "Belum",
  shippingStatus: "Belum",
  totalItemsCount: 2,
  shippedItemsCount: 0,
  createdAt: "2026-10-08T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  sale: {
    id: "sale-1",
    transactionNumber: "051026-33",
    customerName: "FIRMAN",
    customerLocation: "MAKASSAR",
    tipe: {
      id: "tipe-1",
      kode: "SIP",
      nama: "SIP (SLM)"
    }
  }
};

describe("qrGenerator", () => {
  it("generates correct structured plain text payload", () => {
    const payload = generateDeliveryOrderQrPayload(mockDoInternal, "Nia");
    expect(payload).toContain("INVOICE: 051026-33");
    expect(payload).toContain("CUSTOMER: FIRMAN");
    expect(payload).toContain("ALAMAT: MAKASSAR");
    expect(payload).toContain("ASAL: SIP : AJ");
    expect(payload).toContain("PETUGAS: NIA");
  });

  it("handles optional fields gracefully", () => {
    const minimalDo: DeliveryOrderData = {
      ...mockDoInternal,
      sale: {
        id: "sale-2",
        transactionNumber: "051026-99",
        customerName: "BUDI"
      }
    };
    const payload = generateDeliveryOrderQrPayload(minimalDo);
    expect(payload).toContain("INVOICE: 051026-99");
    expect(payload).toContain("CUSTOMER: BUDI");
    expect(payload).not.toContain("ALAMAT:");
    expect(payload).not.toContain("PETUGAS:");
  });

  it("generates valid SVG string", async () => {
    const payload = generateDeliveryOrderQrPayload(mockDoInternal, "Nia");
    const svg = await generateQrCodeSvg(payload);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("generates valid Data URL", async () => {
    const payload = generateDeliveryOrderQrPayload(mockDoInternal, "Nia");
    const dataUrl = await generateQrCodeDataUrl(payload);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
