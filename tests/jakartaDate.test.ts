import { describe, expect, it } from "vitest";
import { formatJakartaDate, formatJakartaDateTime, jakartaDateKey, jakartaMonthKey, jakartaTimestampFromLocal, transactionDateKey, transactionNumberFor } from "@/lib/date/jakarta";

describe("Jakarta date helpers", () => {
  it("uses Asia/Jakarta date instead of UTC date", () => {
    expect(jakartaDateKey(new Date("2026-06-28T18:00:00.000Z"))).toBe("2026-06-29");
  });

  it("uses Asia/Jakarta month at month boundary", () => {
    expect(jakartaMonthKey(new Date("2026-06-30T18:00:00.000Z"))).toBe("2026-07");
  });

  it("formats display date in Indonesian local date", () => {
    expect(formatJakartaDate(new Date("2026-06-28T18:00:00.000Z"))).toBe("29/06/2026");
  });

  it("formats display date time in WIB", () => {
    expect(formatJakartaDateTime(new Date("2026-06-28T18:00:05.000Z"))).toBe("29 Juni 2026, 01.00.05 WIB");
  });

  it("normalizes a local Jakarta transaction time without shifting its business date", () => {
    const timestamp = jakartaTimestampFromLocal("2026-07-18T00:05");
    expect(timestamp).toBe("2026-07-17T17:05:00.000Z");
    expect(transactionDateKey(timestamp)).toBe("2026-07-18");
  });

  it("formats the daily display sequence", () => {
    expect(transactionNumberFor("2026-07-18", 1)).toBe("180726-01");
    expect(transactionNumberFor("2027-07-18", 12)).toBe("180727-12");
    expect(transactionNumberFor("2026-07-18", 100)).toBe("180726-100");
  });
});
