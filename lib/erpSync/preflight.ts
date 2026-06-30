import "server-only";
import { currentAnikaErpToken } from "@/lib/auth/anikaErp";
import { resolveAuthProvider } from "@/lib/auth/request";

export type ErpSyncPreflight = {
  erp: {
    baseUrlConfigured: boolean;
    staticTokenConfigured: boolean;
    sessionTokenAvailable: boolean;
    authReady: boolean;
  };
  autoCreateCustomer: {
    enabled: boolean;
    endpointConfigured: boolean;
    message: string;
  };
};

function autoCreateCustomerEnabled() {
  return String(process.env.ANIKA_ERP_AUTO_CREATE_CUSTOMER ?? "false").trim().toLowerCase() === "true";
}

export async function getErpSyncPreflight(): Promise<ErpSyncPreflight> {
  const autoCreateCustomer = {
    enabled: autoCreateCustomerEnabled(),
    endpointConfigured: true,
    message: autoCreateCustomerEnabled()
      ? "Auto-create customer ERP aktif untuk transaksi AJ customer manual."
      : "Auto-create customer ERP nonaktif. Customer manual AJ yang belum ada di ERP akan gagal/retryable."
  };
  const provider = resolveAuthProvider();
  const sessionTokenAvailable = provider === "anika_erp" ? Boolean(await currentAnikaErpToken()) : false;
  return {
    erp: {
      baseUrlConfigured: Boolean(process.env.ANIKA_ERP_API_BASE_URL),
      staticTokenConfigured: Boolean(process.env.ANIKA_ERP_API_TOKEN),
      sessionTokenAvailable,
      authReady: Boolean(process.env.ANIKA_ERP_API_TOKEN) || sessionTokenAvailable
    },
    autoCreateCustomer
  };
}
