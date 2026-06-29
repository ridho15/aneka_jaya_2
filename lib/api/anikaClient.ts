import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import { failure } from "@/lib/types/api";

const TIMEOUT_MS = 12_000;

export async function anikaRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const baseUrl = process.env.ANIKA_ERP_API_BASE_URL;
  const token = process.env.ANIKA_ERP_API_TOKEN;
  if (!baseUrl || !token) return failure("Konfigurasi ERP belum lengkap.", "ERP_NOT_CONFIGURED");

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
      return failure("Permintaan ke ERP gagal. Silakan coba lagi atau hubungi admin.", `ERP_${response.status}`, body?.message ? { message: body.message } : undefined);
    }
    return { success: true, data: body as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return failure("Koneksi ERP melebihi batas waktu.", "ERP_TIMEOUT");
    return failure("Koneksi ERP bermasalah. Silakan coba lagi.", "ERP_NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}
