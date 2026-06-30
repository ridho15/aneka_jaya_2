import "server-only";
import { currentAnikaErpToken } from "@/lib/auth/anikaErp";
import { resolveAuthProvider } from "@/lib/auth/request";
import { listErpPaginated } from "@/lib/api/pagination";

export type ErpPreflightStatus = "configured" | "missing" | "erp_error";

export type ErpSyncPreflight = {
  erp: {
    baseUrlConfigured: boolean;
    staticTokenConfigured: boolean;
    sessionTokenAvailable: boolean;
    authReady: boolean;
  };
  fallbackCustomer: {
    configured: boolean;
    code?: string;
    found: boolean;
    status: ErpPreflightStatus;
    message: string;
  };
};

type CustomerRow = { id?: unknown; code?: unknown; name?: unknown };

function fallbackCustomerCode() {
  return String(process.env.ANIKA_ERP_FALLBACK_CUSTOMER_CODE ?? "").trim();
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function getErpSyncPreflight(): Promise<ErpSyncPreflight> {
  const code = fallbackCustomerCode();
  const provider = resolveAuthProvider();
  const sessionTokenAvailable = provider === "anika_erp" ? Boolean(await currentAnikaErpToken()) : false;
  const erp = {
    baseUrlConfigured: Boolean(process.env.ANIKA_ERP_API_BASE_URL),
    staticTokenConfigured: Boolean(process.env.ANIKA_ERP_API_TOKEN),
    sessionTokenAvailable,
    authReady: Boolean(process.env.ANIKA_ERP_API_TOKEN) || sessionTokenAvailable
  };

  if (!code) {
    return {
      erp,
      fallbackCustomer: {
        configured: false,
        found: false,
        status: "missing",
        message: "ANIKA_ERP_FALLBACK_CUSTOMER_CODE belum diisi."
      }
    };
  }

  if (!erp.baseUrlConfigured || !erp.authReady) {
    return {
      erp,
      fallbackCustomer: {
        configured: true,
        code,
        found: false,
        status: "erp_error",
        message: "ERP belum siap dicek. Pastikan base URL dan sesi/token ERP tersedia."
      }
    };
  }

  const response = await listErpPaginated("/customers", { maxPages: 1, query: { code } });
  if (!response.success) {
    return {
      erp,
      fallbackCustomer: {
        configured: true,
        code,
        found: false,
        status: "erp_error",
        message: response.message || "Customer fallback ERP belum bisa dicek."
      }
    };
  }

  const rows = response.data as CustomerRow[];
  const found = rows.some((row) => normalize(row.code) === normalize(code)) || rows.length === 1;
  return {
    erp,
    fallbackCustomer: {
      configured: true,
      code,
      found,
      status: found ? "configured" : "missing",
      message: found
        ? `Customer fallback ERP ${code} ditemukan.`
        : `Customer fallback ERP dengan code ${code} tidak ditemukan di Aneka Jaya ERP.`
    }
  };
}
