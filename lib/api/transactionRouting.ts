export const DEFAULT_ERP_TRANSACTION_TYPE_CODE = "AJ";

export function erpTransactionTypeCodes(env: Pick<NodeJS.ProcessEnv, "SALES_ERP_TYPE_CODES"> = process.env) {
  return new Set((env.SALES_ERP_TYPE_CODES || DEFAULT_ERP_TRANSACTION_TYPE_CODE).split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
}

export function transactionTargetForType(code: string, env: Pick<NodeJS.ProcessEnv, "SALES_ERP_TYPE_CODES"> = process.env): "erp" | "local" {
  return erpTransactionTypeCodes(env).has(code.trim().toUpperCase()) ? "erp" : "local";
}
