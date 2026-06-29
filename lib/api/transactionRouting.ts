export const DEFAULT_ERP_TRANSACTION_TYPE_CODE = "AJ";

type RoutingEnv = Record<string, string | undefined>;

export function erpTransactionTypeCodes(env: RoutingEnv = process.env) {
  return new Set((env.SALES_ERP_TYPE_CODES || DEFAULT_ERP_TRANSACTION_TYPE_CODE).split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
}

export function transactionTargetForType(code: string, env: RoutingEnv = process.env): "erp" | "local" {
  return erpTransactionTypeCodes(env).has(code.trim().toUpperCase()) ? "erp" : "local";
}
