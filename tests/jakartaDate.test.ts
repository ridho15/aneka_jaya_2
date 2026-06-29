import { describe, expect, it } from "vitest";
import { formatJakartaDate, jakartaDateKey, jakartaMonthKey } from "@/lib/date/jakarta";

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
});
