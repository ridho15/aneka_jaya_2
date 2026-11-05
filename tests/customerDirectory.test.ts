import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const upsert = vi.fn(async () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { customer: { upsert } } }));

const { customerNameKey, rememberCustomerFromSale } = await import("@/lib/customers/store");

describe("customer directory", () => {
  beforeEach(() => upsert.mockClear());

  it("normalizes names like the customer report", () => {
    expect(customerNameKey("  Toko  Makmur ")).toBe("toko makmur");
    expect(customerNameKey("TOKO MAKMUR")).toBe("toko makmur");
  });

  it("skips Walk In and empty names", async () => {
    await rememberCustomerFromSale({ customerName: "Walk In" }, { countOrder: true });
    await rememberCustomerFromSale({ customerName: "  " }, { countOrder: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("creates with one order and keeps old data when fields are empty", async () => {
    await rememberCustomerFromSale(
      { customerName: " Toko Makmur ", customerPhone: "0812", customerLocation: "", shippingMethod: "JNE", saleDate: "2026-11-05" },
      { countOrder: true }
    );
    const arg = upsert.mock.calls[0][0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    expect(arg.where).toEqual({ nameKey: "toko makmur" });
    expect(arg.create).toMatchObject({ name: "Toko Makmur", phone: "0812", location: null, shippingMethod: "JNE", orderCount: 1 });
    expect(arg.update).toMatchObject({ name: "Toko Makmur", phone: "0812", shippingMethod: "JNE", orderCount: { increment: 1 } });
    expect(arg.update).not.toHaveProperty("location");
  });

  it("does not count an order when only editing", async () => {
    await rememberCustomerFromSale({ customerName: "Toko Makmur" }, { countOrder: false });
    const arg = upsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(arg.update).toEqual({ name: "Toko Makmur" });
  });

  it("never throws when saving fails", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(rememberCustomerFromSale({ customerName: "A" }, { countOrder: true })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
