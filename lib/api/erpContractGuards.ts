import type { Permission } from "@/lib/auth/roles";

export const ERP_CONTRACT_PENDING_CODE = "ERP_CONTRACT_PENDING";

export type PendingErpContractFeature = "sales_correction" | "expense_correction";

export const PENDING_ERP_CONTRACTS: Record<PendingErpContractFeature, {
  permission: Permission;
  message: string;
  requiredContract: string;
}> = {
  sales_correction: {
    permission: "penjualan.manage",
    message: "Koreksi/cancel transaksi AJ yang sudah synced belum diaktifkan karena OpenAPI ERP live belum menyediakan endpoint cancel/update invoice.",
    requiredContract: "Endpoint/command resmi ERP untuk cancel atau koreksi invoice penjualan yang sudah dibuat."
  },
  expense_correction: {
    permission: "pengeluaran.manage",
    message: "Koreksi/cancel pengeluaran AJ yang sudah synced belum diaktifkan karena OpenAPI ERP live belum menyediakan endpoint cancel/update Kas & Bank.",
    requiredContract: "Endpoint/command resmi ERP untuk cancel atau koreksi transaksi Kas & Bank."
  }
};

export function pendingErpContractResponse(feature: PendingErpContractFeature) {
  const contract = PENDING_ERP_CONTRACTS[feature];
  return {
    success: false,
    code: ERP_CONTRACT_PENDING_CODE,
    message: contract.message,
    requiredContract: contract.requiredContract
  };
}
