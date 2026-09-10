import { describe, expect, it } from "vitest";
import {
  isOpenTempoStatus,
  summarizeOpenTempo,
  calculateTempoMetricsSummary,
  addDaysToDateKey,
  toDateKeyString
} from "@/lib/tempo/summary";

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
    expect(isOpenTempoStatus("cancelled")).toBe(false);
    expect(isOpenTempoStatus("written_off")).toBe(false);
  });

  it("calculates date helpers accurately for Jakarta keys", () => {
    expect(addDaysToDateKey("2026-09-10", 3)).toBe("2026-09-13");
    expect(addDaysToDateKey("2026-09-10", 4)).toBe("2026-09-14");
    expect(toDateKeyString("2026-09-10")).toBe("2026-09-10");
    expect(toDateKeyString("2026-09-10T12:00:00.000Z")).toBe("2026-09-10");
  });

  it("accurately classifies tempo into total, overdue, coming soon H-3, and beyond H-3", () => {
    const today = "2026-09-10";
    const rows = [
      // Overdue (< 2026-09-10)
      { status: "open", remainingAmount: 1_000_000, dueDate: "2026-09-05" },
      { status: "overdue", remainingAmount: 2_000_000, dueDate: "2026-09-08" },

      // Coming soon H-3 (2026-09-10 s/d 2026-09-13)
      { status: "open", remainingAmount: 3_000_000, dueDate: "2026-09-10" }, // H+0 (hari ini)
      { status: "partial_paid", remainingAmount: 1_500_000, dueDate: "2026-09-11" }, // H+1
      { status: "open", remainingAmount: 2_500_000, dueDate: "2026-09-13" }, // H+3

      // Beyond H-3 (> 2026-09-13)
      { status: "open", remainingAmount: 5_000_000, dueDate: "2026-09-14" }, // H+4
      { status: "open", remainingAmount: 5_000_000, dueDate: "2026-09-30" }, // H+20

      // Final statuses (should be ignored)
      { status: "paid", remainingAmount: 0, dueDate: "2026-09-01" },
      { status: "cancelled", remainingAmount: 10_000_000, dueDate: "2026-09-05" },
      { status: "written_off", remainingAmount: 5_000_000, dueDate: "2026-09-07" }
    ];

    const metrics = calculateTempoMetricsSummary(rows, today);

    // Total: 1M + 2M + 3M + 1.5M + 2.5M + 5M + 5M = 20M across 7 active rows
    expect(metrics.total.count).toBe(7);
    expect(metrics.total.amount).toBe(20_000_000);

    // Overdue: 2 items (1M + 2M = 3M, 3/20 = 15%)
    expect(metrics.overdue.count).toBe(2);
    expect(metrics.overdue.amount).toBe(3_000_000);
    expect(metrics.overdue.percentage).toBe(15);

    // Coming soon H-3: 3 items (3M + 1.5M + 2.5M = 7M, 7/20 = 35%)
    expect(metrics.comingSoonH3.count).toBe(3);
    expect(metrics.comingSoonH3.amount).toBe(7_000_000);
    expect(metrics.comingSoonH3.percentage).toBe(35);
    expect(metrics.comingSoonH3.fromDate).toBe("2026-09-10");
    expect(metrics.comingSoonH3.toDate).toBe("2026-09-13");

    // Beyond H-3: 2 items (5M + 5M = 10M, 10/20 = 50%)
    expect(metrics.beyondH3.count).toBe(2);
    expect(metrics.beyondH3.amount).toBe(10_000_000);
    expect(metrics.beyondH3.percentage).toBe(50);
    expect(metrics.beyondH3.fromDate).toBe("2026-09-14");
  });

  it("handles empty or zero-amount active rows gracefully", () => {
    const metrics = calculateTempoMetricsSummary([], "2026-09-10");
    expect(metrics.total.count).toBe(0);
    expect(metrics.total.amount).toBe(0);
    expect(metrics.overdue.percentage).toBe(0);
    expect(metrics.comingSoonH3.percentage).toBe(0);
    expect(metrics.beyondH3.percentage).toBe(0);
  });
});
