import { describe, expect, it } from "vitest";
import { buildErpShape, rowsFromErpPayload } from "@/lib/api/erpShapeAudit";

describe("ERP shape audit", () => {
  it("extracts rows from common ERP payload wrappers", () => {
    expect(rowsFromErpPayload([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(rowsFromErpPayload({ data: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(rowsFromErpPayload({ data: { data: [{ id: 3 }] } })).toEqual([{ id: 3 }]);
  });

  it("returns only field shape with short sanitized samples", () => {
    const shape = buildErpShape("products", {
      data: [{
        sku: "SKU-001",
        name: "Produk dengan nama yang panjang sekali untuk dipotong",
        api_token: "secret-token",
        category: { name: "Lain - Lain" },
        prices: [{ sell_price: 12000 }]
      }]
    });

    expect(shape.keys).toEqual(expect.arrayContaining(["api_token", "category", "name", "prices", "sku"]));
    expect(shape.fields.api_token.samples).toEqual(["[redacted]"]);
    expect(shape.fields.name.samples[0].endsWith("…")).toBe(true);
    expect(shape.fields.category.children?.name.samples).toEqual(["Lain - Lain"]);
    expect(shape.fields.prices.children?.sell_price.samples).toEqual(["12000"]);
  });
});
