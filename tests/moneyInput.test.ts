import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoneyInput } from "@/components/ui/MoneyInput";

describe("MoneyInput helpers", () => {
  it("formats numbers with Indonesian thousands separators", () => {
    expect(formatMoneyInput(1_000_000)).toBe("1.000.000");
    expect(formatMoneyInput(950_000)).toBe("950.000");
  });

  it("parses formatted input back to a plain number", () => {
    expect(parseMoneyInput("1.000.000")).toBe(1_000_000);
    expect(parseMoneyInput("Rp 950.000")).toBe(950_000);
  });

  it("keeps empty or invalid input as zero instead of NaN", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
    expect(formatMoneyInput(Number.NaN)).toBe("");
  });
});
