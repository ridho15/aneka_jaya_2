import { describe, expect, it } from "vitest";
import { isOpenTempoStatus, summarizeOpenTempo } from "@/lib/tempo/summary";

describe("tempo summary", () => {
  it("counts open, overdue, and partial_paid as open tempo", () => {
    const summary = summarizeOpenTempo([
      { status: "open", remainingAmount: 100 },
      { status: "overdue", remainingAmount: 200 },
      { status: "partial_paid", remainingAmount: 300 },
      { status: "paid", remainingAmount: 400 },
      { status: "cancelled", remainingAmount: 500 },
      { status: "written_off", remainingAmount: 600 }
    ]);

    expect(summary.openTempo.map((row) => row.status)).toEqual(["open", "overdue", "partial_paid"]);
    expect(summary.openTempoAmount).toBe(600);
  });

  it("classifies only unpaid active statuses as open tempo", () => {
    expect(isOpenTempoStatus("open")).toBe(true);
    expect(isOpenTempoStatus("overdue")).toBe(true);
    expect(isOpenTempoStatus("partial_paid")).toBe(true);
    expect(isOpenTempoStatus("paid")).toBe(false);
  });
});
