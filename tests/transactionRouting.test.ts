import { describe, expect, it } from "vitest";
import { erpTransactionTypeCodes, transactionTargetForType } from "@/lib/api/transactionRouting";

describe("transaction routing by tipe", () => {
  it("routes AJ to ERP by default and keeps LSM local", () => {
    expect(transactionTargetForType("AJ", {})).toBe("erp");
    expect(transactionTargetForType("LSM", {})).toBe("local");
    expect(transactionTargetForType("ONLINE", {})).toBe("local");
  });

  it("honors SALES_ERP_TYPE_CODES when explicitly configured", () => {
    expect(Array.from(erpTransactionTypeCodes({ SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" }))).toEqual(["AJ", "WHOLESALE"]);
    expect(transactionTargetForType("WHOLESALE", { SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" })).toBe("erp");
    expect(transactionTargetForType("LSM", { SALES_ERP_TYPE_CODES: "AJ,WHOLESALE" })).toBe("local");
  });
});
