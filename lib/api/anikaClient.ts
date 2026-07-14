import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";
import { currentAnikaErpToken } from "@/lib/auth/anikaErp";
import { resolveAuthProvider } from "@/lib/auth/request";

const TIMEOUT_MS = 12_000;
const MAX_SAFE_MESSAGE_LENGTH = 300;

type SafeErpError = {
  code: string;
  message: string;
  status: number;
  upstreamCode?: string;
  upstreamMessage?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function truncateSafe(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > MAX_SAFE_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_SAFE_MESSAGE_LENGTH)}…` : trimmed;
}

function sanitizeOperationalMessage(value: string | undefined) {
  if (!value) return undefined;
  if (/isSpecial/i.test(value)) return "isSpecial wajib diisi";
  if (/Unknown column 'erp_reference'.*customer_receipts/i.test(value)) {
    return "Database Aneka Jaya ERP belum dimigrasi untuk payment idempotency. Kolom customer_receipts.erp_reference belum tersedia.";
  }
  if (/SQLSTATE|Integrity constraint|insert into|Column '.+' cannot be null/i.test(value)) return "ERP menolak data karena constraint database.";
  return value;
}

function safeUpstreamError(body: unknown) {
  const row = asRecord(body);
  const nested = asRecord(row?.error) || asRecord(row?.data);
  const upstreamCode = truncateSafe(firstString(row?.code, row?.error_code, nested?.code, nested?.error_code));
  const upstreamMessage = truncateSafe(sanitizeOperationalMessage(firstString(row?.message, row?.error, row?.detail, nested?.message, nested?.detail)));
  return { upstreamCode, upstreamMessage };
}

function mapErpError(status: number, body: unknown): SafeErpError {
  const { upstreamCode, upstreamMessage } = safeUpstreamError(body);
  if (status === 401 || status === 403) {
    return { status, code: "ERP_AUTH", message: "Akses ke ERP ditolak. Hubungi Super Admin.", upstreamCode, upstreamMessage };
  }
  if (status === 422) {
    return { status, code: "ERP_VALIDATION", message: upstreamMessage ? `ERP menolak payload: ${upstreamMessage}` : "ERP menolak payload/data transaksi.", upstreamCode, upstreamMessage };
  }
  if (status === 404) {
    return { status, code: "ERP_NOT_FOUND", message: upstreamMessage ? `Endpoint/resource ERP tidak ditemukan: ${upstreamMessage}` : "Endpoint/resource ERP tidak ditemukan.", upstreamCode, upstreamMessage };
  }
  if (status >= 500) {
    return { status, code: "ERP_UPSTREAM", message: upstreamMessage ? `ERP service error: ${upstreamMessage}` : "ERP sedang tidak dapat melayani permintaan.", upstreamCode, upstreamMessage };
  }
  return { status, code: "ERP_UPSTREAM", message: upstreamMessage || "ERP sedang tidak dapat melayani permintaan.", upstreamCode, upstreamMessage };
}

function safeDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ERP_DEBUG_SAFE_LOG === "true";
}

function correlationIdFromInit(init: RequestInit) {
  try {
    const body = typeof init.body === "string" ? JSON.parse(init.body) as unknown : undefined;
    const row = asRecord(body);
    return firstString(row?.message_id, row?.correlation_id);
  } catch {
    return undefined;
  }
}

function logSafeErpError(input: { path: string; method: string; correlationId?: string; error: SafeErpError }) {
  if (!safeDebugEnabled()) return;
  console.warn("[ERP safe error]", JSON.stringify({
    endpoint: input.path,
    method: input.method,
    status: input.error.status,
    code: input.error.code,
    upstreamCode: input.error.upstreamCode,
    upstreamMessage: input.error.upstreamMessage,
    correlationId: input.correlationId
  }));
}

export async function anikaRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const baseUrl = process.env.ANIKA_ERP_API_BASE_URL;
  const token = process.env.ANIKA_ERP_API_TOKEN || await currentAnikaErpToken();
  if (!baseUrl) return failure("Konfigurasi ERP belum lengkap.", "ERP_NOT_CONFIGURED");
  if (!token) {
    return resolveAuthProvider() === "anika_erp"
      ? failure("Sesi ERP tidak tersedia. Silakan masuk kembali.", "ERP_SESSION_REQUIRED")
      : failure("Konfigurasi ERP belum lengkap.", "ERP_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
      cache: "no-store",
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = mapErpError(response.status, body);
      logSafeErpError({ path, method: init.method || "GET", correlationId: correlationIdFromInit(init), error });
      return failure(error.message, error.code, { status: error.status, upstreamCode: error.upstreamCode, correlationId: correlationIdFromInit(init) });
    }
    return { success: true, data: body as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return failure("Koneksi ERP melebihi batas waktu.", "ERP_TIMEOUT");
    return failure("Koneksi ERP bermasalah. Silakan coba lagi.", "ERP_NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}
