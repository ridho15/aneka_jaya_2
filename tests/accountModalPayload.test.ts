import { describe, expect, it } from "vitest";
import { accountSavePayload, type AccountRecord } from "@/components/accounting/AccountModal";

const inventory: AccountRecord = { id: "a1", code: "1-1005", name: "Persediaan Barang Dagang", category: "ASSET", normalBalance: "DEBIT", description: "Lama", isSystem: true, isActive: true, reportGroup: "CURRENT_ASSET" };
const custom: AccountRecord = { id: "a2", code: "6-2001", name: "Beban Sewa", category: "EXPENSE", normalBalance: "DEBIT", description: null, isSystem: false, isActive: true };

describe("COA save payload", () => {
  it("system account: only name/description are sent, never code, category or normal balance", () => {
    const payload = accountSavePayload(inventory, { code: "", name: "Persediaan Barang Dagang", category: "EXPENSE", normalBalance: "CREDIT", description: "Barang milik usaha untuk dijual", reportGroup: "" });
    expect(payload).toEqual({ description: "Barang milik usaha untuk dijual" });
  });
  it("nothing changed: empty payload, so Simpan does not touch the account", () => {
    expect(accountSavePayload(inventory, { code: "1-1005", name: "Persediaan Barang Dagang", category: "ASSET", normalBalance: "DEBIT", description: "Lama", reportGroup: "CURRENT_ASSET" })).toEqual({});
  });
  it("custom account: only changed fields", () => {
    expect(accountSavePayload(custom, { code: "6-2001", name: "Beban Sewa Toko", category: "EXPENSE", normalBalance: "DEBIT", description: "" })).toEqual({ name: "Beban Sewa Toko" });
  });
  it("new account sends every field", () => {
    expect(accountSavePayload(null, { code: "1-2003", name: "Kendaraan", category: "ASSET", normalBalance: "DEBIT", description: "", reportGroup: "FIXED_ASSET" }))
      .toEqual({ code: "1-2003", name: "Kendaraan", category: "ASSET", normalBalance: "DEBIT", description: undefined, reportGroup: "FIXED_ASSET" });
  });
});
