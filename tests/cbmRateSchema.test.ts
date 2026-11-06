import { describe, expect, it } from "vitest";
import { cbmRateSchema, rmbRateSchema } from "@/lib/inventory/validation";

describe("rate validation", () => {
  it("accepts a CBM tariff in millions of rupiah", () => {
    expect(cbmRateSchema.parse({ rate: 3_500_000 }).rate).toBe(3_500_000);
  });
  it("rejects zero with a clear message", () => {
    const r = cbmRateSchema.safeParse({ rate: 0 });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("Tarif CBM harus lebih dari 0");
  });
  it("RMB rate keeps its own limit", () => {
    expect(rmbRateSchema.safeParse({ rate: 3_500_000 }).success).toBe(false);
  });
});
