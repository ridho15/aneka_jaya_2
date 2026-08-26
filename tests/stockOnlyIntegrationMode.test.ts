import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  salesTargetForTypeCode,
  expenseTargetForTypeCode,
  transactionTargetForType,
} from "@/lib/api/transactionRouting";
import {
  normalizeErpSyncSetting,
  ERP_TRANSACTION_SYNC_ENABLED_KEY,
  MJ_TRANSACTION_MODE_KEY,
} from "@/lib/settings/erpSync";

describe("Stock-Only Integration Mode & Transaction Routing", () => {
  it("forces sales and expenses to local target when transaction sync is disabled", () => {
    const env = { SALES_ERP_TYPE_CODES: "AJ,SLM", EXPENSE_ERP_TYPE_CODES: "AJ" };

    // When sync is enabled (default)
    expect(salesTargetForTypeCode("AJ", env, true)).toBe("erp");
    expect(expenseTargetForTypeCode("AJ", env, true)).toBe("erp");
    expect(transactionTargetForType("AJ", env, true)).toBe("erp");

    // When sync is disabled (Stock-Only Mode)
    expect(salesTargetForTypeCode("AJ", env, false)).toBe("local");
    expect(expenseTargetForTypeCode("AJ", env, false)).toBe("local");
    expect(transactionTargetForType("AJ", env, false)).toBe("local");

    // Types not configured for ERP always stay local
    expect(salesTargetForTypeCode("NON_AJ", env, false)).toBe("local");
    expect(expenseTargetForTypeCode("NON_AJ", env, false)).toBe("local");
  });

  it("respects ENABLE_ERP_TRANSACTION_SYNC environment variable as fallback", () => {
    const disabledEnv = {
      SALES_ERP_TYPE_CODES: "AJ",
      EXPENSE_ERP_TYPE_CODES: "AJ",
      ENABLE_ERP_TRANSACTION_SYNC: "false",
    };

    expect(salesTargetForTypeCode("AJ", disabledEnv, true)).toBe("local");
    expect(expenseTargetForTypeCode("AJ", disabledEnv, true)).toBe("local");
  });

  it("correctly normalizes ErpSyncSetting and default values", () => {
    // Default normalization
    const defaultSettings = normalizeErpSyncSetting();
    expect(defaultSettings.autoSyncAfterSalesEdit).toBe(false);
    expect(typeof defaultSettings.erpTransactionSyncEnabled).toBe("boolean");
    expect(["disabled", "record_only", "process_aj"]).toContain(defaultSettings.mjTransactionMode);

    // Custom normalization
    const custom = normalizeErpSyncSetting({
      autoSyncAfterSalesEdit: "true",
      erpTransactionSyncEnabled: "false",
      mjTransactionMode: "record_only",
    });
    expect(custom.autoSyncAfterSalesEdit).toBe(true);
    expect(custom.erpTransactionSyncEnabled).toBe(false);
    expect(custom.mjTransactionMode).toBe("record_only");

    // Invalid mode falls back safely
    const fallback = normalizeErpSyncSetting({
      mjTransactionMode: "invalid_mode",
    });
    expect(["disabled", "record_only", "process_aj"]).toContain(fallback.mjTransactionMode);
  });

  it("exports correct setting keys for database storage", () => {
    expect(ERP_TRANSACTION_SYNC_ENABLED_KEY).toBe("erp_transaction_sync_enabled");
    expect(MJ_TRANSACTION_MODE_KEY).toBe("mj_transaction_mode");
  });
});
