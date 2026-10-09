import { describe, it, expect } from "vitest";
import {
  parseReceiptPhotos,
  serializeReceiptPhotos,
  getFirstReceiptPhoto
} from "@/lib/deliveryOrders/photos";

describe("deliveryOrder photos helpers", () => {
  it("parses empty or null/undefined inputs into empty array", () => {
    expect(parseReceiptPhotos(null)).toEqual([]);
    expect(parseReceiptPhotos(undefined)).toEqual([]);
    expect(parseReceiptPhotos("")).toEqual([]);
    expect(parseReceiptPhotos("   ")).toEqual([]);
  });

  it("parses legacy single URL string into single-element array", () => {
    const single = "https://storage.example.com/receipt-001.jpg";
    expect(parseReceiptPhotos(single)).toEqual([single]);
  });

  it("parses JSON array string into multi-element array", () => {
    const jsonStr = JSON.stringify([
      "https://storage.example.com/receipt-1.jpg",
      "https://storage.example.com/receipt-2.jpg"
    ]);
    expect(parseReceiptPhotos(jsonStr)).toEqual([
      "https://storage.example.com/receipt-1.jpg",
      "https://storage.example.com/receipt-2.jpg"
    ]);
  });

  it("serializes empty array to empty string", () => {
    expect(serializeReceiptPhotos([])).toBe("");
    expect(serializeReceiptPhotos(["", "   "])).toBe("");
  });

  it("serializes single photo to clean single string (backward compatible)", () => {
    const url = "https://storage.example.com/receipt-1.jpg";
    expect(serializeReceiptPhotos([url])).toBe(url);
  });

  it("serializes multiple photos to valid JSON string", () => {
    const photos = [
      "https://storage.example.com/receipt-1.jpg",
      "https://storage.example.com/receipt-2.jpg"
    ];
    const serialized = serializeReceiptPhotos(photos);
    expect(serialized.startsWith("[")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(photos);
  });

  it("extracts first photo reliably", () => {
    expect(getFirstReceiptPhoto(null)).toBeUndefined();
    expect(getFirstReceiptPhoto("https://example.com/1.jpg")).toBe("https://example.com/1.jpg");
    expect(
      getFirstReceiptPhoto(JSON.stringify(["https://example.com/1.jpg", "https://example.com/2.jpg"]))
    ).toBe("https://example.com/1.jpg");
  });
});
