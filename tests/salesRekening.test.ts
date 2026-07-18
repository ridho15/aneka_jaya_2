import { describe, expect, it } from "vitest";
import { salesRekeningLabel } from "@/lib/sales/rekening";

const master = [
  { id: "active", name: "BCA Aktif" },
  { id: "inactive", name: "Mandiri Nonaktif" }
];

describe("sales rekening display label", () => {
  it("keeps the historical snapshot ahead of the current master name", () => {
    expect(salesRekeningLabel({ rekeningId: "active", rekeningNameSnapshot: "BCA Lama" }, master)).toBe("BCA Lama");
  });

  it("resolves legacy ids from active or inactive master accounts", () => {
    expect(salesRekeningLabel({ rekeningId: "inactive" }, master)).toBe("Mandiri Nonaktif");
  });

  it("falls back through legacy account, raw id, and an empty marker", () => {
    expect(salesRekeningLabel({ transferAccount: "Legacy BRI" }, master)).toBe("Legacy BRI");
    expect(salesRekeningLabel({ rekeningId: "deleted" }, master)).toBe("deleted");
    expect(salesRekeningLabel({}, master)).toBe("—");
  });
});
