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

  it("joins product and stock by product id and sums only valid ERP quantities", () => {
    const html = renderToStaticMarkup(React.createElement(ProductList, {
      products: [{
        id: "88",
        productId: "88",
        code: "ERP-88",
        name: "Produk Live ERP",
        category: "Aksesoris",
        sellingPrice: 175000,
        minimumStock: null,
        isActive: true,
        updatedAt: "2026-06-29T10:00:00.000Z",
        dataQualityWarnings: []
      }],
      stocks: [{
        id: "S-1",
        productId: "88",
        productCode: "ERP-88",
        productName: "Produk Live ERP",
        warehouse: "Gudang Utama",
        rack: "Rak A1",
        quantity: 7,
        minimumStock: 3,
        unit: "PCS"
      }, {
        id: "S-2",
        productId: "88",
        productCode: "",
        productName: "Produk Live ERP",
        warehouse: "Toko",
        rack: "Rak B1",
        quantity: 5,
        minimumStock: null,
        unit: "PCS"
      }, {
        id: "S-3",
        productId: "88",
        productCode: "",
        productName: "Produk Live ERP",
        warehouse: "Gudang Rusak",
        rack: "Rak X",
        quantity: null,
        minimumStock: null,
        unit: "PCS",
        dataQualityWarnings: ["quantity"]
      }]
    }));

    expect(html).toContain("Gudang Utama / Rak A1, Toko / Rak B1 +1");
    expect(html).toContain(">12<");
    expect(html).toContain(">3<");
    expect(html).toContain("Data ERP tidak lengkap");
    expect(html).toMatch(/Rp(?:&nbsp;|\s)?175\.000/);
  });

  it("prioritizes product stock summary over stock aggregation", () => {
    const html = renderToStaticMarkup(React.createElement(ProductList, {
      products: [{
        id: "91",
        productId: "91",
        code: "ERP-91",
        name: "Produk Summary ERP",
        category: "Aksesoris",
        sellingPrice: 99000,
        minimumStock: null,
        isActive: true,
        updatedAt: "2026-06-29T10:00:00.000Z",
        stockSummary: {
          quantity: 0,
          reservedQuantity: 2,
          freeQuantity: 0,
          onHandQuantity: 2,
          minimumStock: 5,
          warehouseCount: 2,
          rackCount: 3,
          isLowStock: true
        },
        stockBreakdown: [{
          id: "B-1",
          productId: "91",
          productCode: "ERP-91",
          productName: "Produk Summary ERP",
          warehouse: "Gudang Utama",
          rack: "Rak A",
          quantity: 10,
          minimumStock: 5,
          unit: "PCS"
        }],
        dataQualityWarnings: []
      }],
      stocks: []
    }));

    expect(html).toContain(">0<");
    expect(html).toContain(">5<");
    expect(html).toContain("Gudang Utama / Rak A");
    expect(html).toContain("bg-red-50");
  });
});
