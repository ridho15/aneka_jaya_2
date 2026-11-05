import { describe, expect, it } from "vitest";
import { expenseDebitAccountCode, selectableExpenseAccounts } from "@/lib/expenses/coa";

describe("expense COA", () => {
  it("maps legacy choices and detailed codes to ledger accounts", () => {
    expect(expenseDebitAccountCode("Transport")).toBe("6-1003");
    expect(expenseDebitAccountCode("Kas")).toBe("6-1001");
    expect(expenseDebitAccountCode("6-1101")).toBe("6-1101");
    expect(expenseDebitAccountCode("6-1101 Beban Bensin Armada")).toBe("6-1101");
    expect(expenseDebitAccountCode(null)).toBe("6-1001");
  });

  it("offers active expense accounts except system-managed ones", () => {
    const acc = (code: string, category = "EXPENSE", isActive = true) => ({ code, name: code, category, isActive });
    const codes = selectableExpenseAccounts([acc("5-1001"), acc("6-1001"), acc("6-1002"), acc("6-1101"), acc("6-1102", "EXPENSE", false), acc("1-1001", "ASSET")]).map((a) => a.code);
    expect(codes).toEqual(["6-1001", "6-1101"]);
  });
});
