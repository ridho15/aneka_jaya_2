import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { allocateTransactionIdentity } = await import("@/lib/sales/store");

describe("sales transaction identity", () => {
  it("allocates the atomic counter and formats DDMMYY-01", async () => {
    const upsert = vi.fn(async () => ({ dateKey: "2026-07-18", lastValue: 1 }));
    const result = await allocateTransactionIdentity({ dailyTransactionCounter: { upsert } } as never, "2026-07-17T17:05:00.000Z");
    expect(upsert).toHaveBeenCalledWith({
      where: { dateKey: "2026-07-18" },
      create: { dateKey: "2026-07-18", lastValue: 1 },
      update: { lastValue: { increment: 1 } }
    });
    expect(result).toEqual({ transactionAt: "2026-07-17T17:05:00.000Z", transactionDateKey: "2026-07-18", transactionSequence: 1, transactionNumber: "180726-01" });
  });

  it("uses the next sequence returned by a concurrent-safe database upsert", async () => {
    const upsert = vi.fn(async () => ({ dateKey: "2026-07-18", lastValue: 2 }));
    await expect(allocateTransactionIdentity({ dailyTransactionCounter: { upsert } } as never, "2026-07-18T03:00:00.000Z"))
      .resolves.toMatchObject({ transactionSequence: 2, transactionNumber: "180726-02" });
  });

  it("keeps the display number distinct for the same day and month in another year", async () => {
    const upsert = vi.fn(async () => ({ dateKey: "2027-07-18", lastValue: 1 }));
    await expect(allocateTransactionIdentity({ dailyTransactionCounter: { upsert } } as never, "2027-07-17T17:05:00.000Z"))
      .resolves.toMatchObject({ transactionDateKey: "2027-07-18", transactionNumber: "180727-01" });
  });
});
