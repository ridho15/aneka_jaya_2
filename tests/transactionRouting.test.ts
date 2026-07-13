import { describe, expect, it } from "vitest";
import { erpExpenseTypeCodes, erpSalesTypeCodes, erpTransactionTypeCodes, expenseTargetForTypeCode, salesTargetForTypeCode, transactionTargetForType } from "@/lib/api/transactionRouting";

describe("transaction routing by tipe", () => {
  it("routes AJ to ERP by default and keeps non-AJ local", () => {
    expect(transactionTargetForType("AJ", {})).toBe("erp");
    expect(transactionTargetForType("W", {})).toBe("local");
    expect(transactionTargetForType("SLM", {})).toBe("local");
    expect(transactionTargetForType("ONLINE", {})).toBe("local");
  });

  it("honors SALES_ERP_TYPE_CODES when explicitly configured", () => {
    expect(Array.from(erpTransactionTypeCodes({ SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" }))).toEqual(["AJ", "WHOLESALE"]);
    expect(transactionTargetForType("WHOLESALE", { SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" })).toBe("erp");
    expect(transactionTargetForType("W", { SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" })).toBe("local");
  });

  it("can route all sales types to ERP without changing expense routing", () => {
    const env = { SALES_ERP_TYPE_CODES: "AJ,W,SLM,ONLINE", EXPENSE_ERP_TYPE_CODES: "AJ" };

    expect(Array.from(erpSalesTypeCodes(env))).toEqual(["AJ", "W", "SLM", "ONLINE"]);
    expect(Array.from(erpExpenseTypeCodes(env))).toEqual(["AJ"]);
    expect(salesTargetForTypeCode("W", env)).toBe("erp");
    expect(salesTargetForTypeCode("SLM", env)).toBe("erp");
    expect(salesTargetForTypeCode("ONLINE", env)).toBe("erp");
    expect(expenseTargetForTypeCode("W", env)).toBe("local");
  });
});
