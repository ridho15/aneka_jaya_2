import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductList } from "@/components/products/ProductList";

describe("ProductList rendering", () => {
  it("renders normalized values without fallback artifacts", () => {
    const html = renderToStaticMarkup(React.createElement(ProductList, {
      products: [{
        id: "P-1",
        code: "ABC-1",
        name: "Produk ABC",
        category: "Aksesoris",
        sellingPrice: 0,
        minimumStock: 0,
        isActive: false,
        updatedAt: "2026-06-29T10:00:00.000Z",
        dataQualityWarnings: []
      }],
      stocks: [{
        id: "S-1",
        productCode: " abc-1 ",
        productName: "Produk ABC",
        warehouse: "Toko",
        quantity: 2,
        minimumStock: 0,
        unit: "PCS"
      }]
    }));

    expect(html).toContain("Aksesoris");
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Tidak aktif");
    expect(html).toMatch(/Rp(?:&nbsp;|\s)?0/);
    expect(html).toContain(">2<");
  });

  it("renders missing ERP data as dash with an operational warning", () => {
    const html = renderToStaticMarkup(React.createElement(ProductList, {
      products: [{
        id: "P-2",
        code: "P-2",
        name: "Produk Parsial",
        category: null,
        sellingPrice: null,
        minimumStock: null,
        isActive: null,
        updatedAt: "2026-06-29T10:00:00.000Z",
        dataQualityWarnings: ["kategori", "harga jual", "status"]
      }],
      stocks: [],
      initialStockError: "ERP stok tidak tersedia."
    }));

    expect(html).toContain("Stok ERP belum berhasil dimuat.");
    expect(html).toContain("Data ERP tidak lengkap");
    expect(html).toContain("—");
    expect(html).not.toContain("Rp NaN");
  });
});
