import { describe, expect, it } from "vitest";
import { koliToQty, qtyToKoliFields } from "@/components/inventory/labels";
import { waNumber } from "@/lib/tempo/whatsapp";

describe("qtyToKoliFields", () => {
  it("round-trips with koliToQty", () => {
    for (const [qty, per] of [[698, 60], [120, 60], [35, 60], [0, 60], [12.5, null], [0, null]] as const) {
      const f = qtyToKoliFields(qty, per);
      expect(koliToQty(f.koli, f.loose, per)).toBe(qty);
      expect(f.koli !== "" || f.loose !== "").toBe(true);
    }
  });

  it("splits into koli and loose", () => {
    expect(qtyToKoliFields(698, 60)).toEqual({ koli: "11", loose: "38" });
    expect(qtyToKoliFields(120, 60)).toEqual({ koli: "2", loose: "" });
  });
});

describe("waNumber", () => {
  it("normalises Indonesian numbers", () => {
    expect(waNumber("0812-3456-789")).toBe("628123456789");
    expect(waNumber("+62 812 3456 789")).toBe("628123456789");
    expect(waNumber("8123456789")).toBe("628123456789");
  });

  it("rejects empty or junk", () => {
    expect(waNumber("")).toBeNull();
    expect(waNumber(undefined)).toBeNull();
    expect(waNumber("123")).toBeNull();
  });
});
