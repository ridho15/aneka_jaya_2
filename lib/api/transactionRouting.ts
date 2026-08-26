export const DEFAULT_ERP_TRANSACTION_TYPE_CODE = "AJ";

type RoutingEnv = Record<string, string | undefined>;

function parseTypeCodes(value?: string) {
  return new Set((value || DEFAULT_ERP_TRANSACTION_TYPE_CODE).split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
}

export function erpSalesTypeCodes(env: RoutingEnv = process.env) {
  return parseTypeCodes(env.SALES_ERP_TYPE_CODES);
}

export function erpExpenseTypeCodes(env: RoutingEnv = process.env) {
  return parseTypeCodes(env.EXPENSE_ERP_TYPE_CODES);
}

export function erpTransactionTypeCodes(env: RoutingEnv = process.env) {
  return erpSalesTypeCodes(env);
}

export function salesTargetForTypeCode(
  code: string,
  env: RoutingEnv = process.env,
  isSyncEnabled = true
): "erp" | "local" {
  if (!isSyncEnabled || env.ENABLE_ERP_TRANSACTION_SYNC === "false") {
    return "local";
  }
  return erpSalesTypeCodes(env).has(code.trim().toUpperCase()) ? "erp" : "local";
}

export function expenseTargetForTypeCode(
  code: string,
  env: RoutingEnv = process.env,
  isSyncEnabled = true
): "erp" | "local" {
  if (!isSyncEnabled || env.ENABLE_ERP_TRANSACTION_SYNC === "false") {
    return "local";
  }
  return erpExpenseTypeCodes(env).has(code.trim().toUpperCase()) ? "erp" : "local";
}

export function transactionTargetForType(
  code: string,
  env: RoutingEnv = process.env,
  isSyncEnabled = true
): "erp" | "local" {
  return salesTargetForTypeCode(code, env, isSyncEnabled);
}
