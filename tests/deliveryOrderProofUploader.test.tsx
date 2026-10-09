import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeliveryOrderProofUploader } from "@/components/deliveryOrders/DeliveryOrderProofUploader";
import { compressImage } from "@/lib/utils/imageCompression";

describe("DeliveryOrderProofUploader Component", () => {
  it("renders smart camera and file upload action buttons", () => {
    const html = renderToStaticMarkup(
      <DeliveryOrderProofUploader
        onPhotoChange={vi.fn()}
      />
    );

    expect(html).toContain("Foto Resi / Bukti Pengiriman");
    expect(html).toContain("Foto Kamera");
    expect(html).toContain("Pilih dari File");
    expect(html).not.toContain("Buka Viewfinder");
    expect(html).toContain("Belum ada foto bukti pengiriman.");
  });

  it("renders photo preview, view full link, and delete button when receiptPhotoUrl is provided", () => {
    const testUrl = "https://example.com/uploads/bukti-resi-123.jpg";
    const html = renderToStaticMarkup(
      <DeliveryOrderProofUploader
        receiptPhotoUrl={testUrl}
        onPhotoChange={vi.fn()}
      />
    );

    expect(html).toContain("Tersimpan 1 foto");
    expect(html).toContain("Foto #1");
    expect(html).toContain(testUrl);
    expect(html).toContain("Lihat Penuh");
    expect(html).toContain("Hapus");
  });

  it("renders multiple photo cards when multiple URLs or JSON array string is provided", () => {
    const photos = [
      "https://example.com/uploads/bukti-1.jpg",
      "https://example.com/uploads/bukti-2.jpg"
    ];
    const html = renderToStaticMarkup(
      <DeliveryOrderProofUploader
        receiptPhotoUrl={JSON.stringify(photos)}
        onPhotoChange={vi.fn()}
      />
    );

    expect(html).toContain("Tersimpan 2 foto");
    expect(html).toContain("Foto #1");
    expect(html).toContain("Foto #2");
    expect(html).toContain("https://example.com/uploads/bukti-1.jpg");
    expect(html).toContain("https://example.com/uploads/bukti-2.jpg");
    expect(html).toContain("+ Tambah Foto");
  });

  it("disables action buttons and hides delete button when disabled is true", () => {
    const testUrl = "https://example.com/uploads/bukti-resi-123.jpg";
    const html = renderToStaticMarkup(
      <DeliveryOrderProofUploader
        receiptPhotoUrl={testUrl}
        onPhotoChange={vi.fn()}
        disabled={true}
      />
    );

    expect(html).toContain("disabled");
    // When disabled, delete button should not be rendered
    expect(html).not.toContain("Hapus");
  });
});

describe("compressImage Utility", () => {
  it("returns non-image files directly without modification", async () => {
    const pdfFile = new File(["dummy pdf content"], "invoice.pdf", {
      type: "application/pdf"
    });

    const result = await compressImage(pdfFile);
    expect(result).toBe(pdfFile);
    expect(result.name).toBe("invoice.pdf");
  });

  it("handles environment without canvas/browser gracefully by returning original file", async () => {
    const imageFile = new File(["dummy image content"], "resi.jpg", {
      type: "image/jpeg"
    });

    const result = await compressImage(imageFile);
    expect(result).toBe(imageFile);
  });
});
