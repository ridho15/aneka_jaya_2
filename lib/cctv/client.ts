import "server-only";

const CCTV_BASE_URL =
  process.env.CCTV_BASE_URL || "http://31.97.51.194:8000";

const CCTV_TOKEN =
  process.env.SLM_API_TOKEN ||
  process.env.CCTV_API_TOKEN ||
  process.env.CCTV_INTEGRATION_TOKEN ||
  "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";

export interface CctvInvoiceResponse {
  found: boolean;
  invoice_number: string;
  customer_name?: string;
  store_source?: string;
  packing_status?: "completed" | "in_progress" | string;
  review_status?: string;
  slm_status?: string;
  slm_sync_status?: string;
  slm_reference?: string;
  first_seen_at?: string;
  packing_completed_at?: string;
  evidence_url?: string;
  camera_name?: string;
  confidence?: number;
  message?: string;
}

export interface CctvCameraStatus {
  id: number | string;
  name: string;
  location?: string;
  status: "online" | "offline";
  detector_ready: boolean;
  last_seen_at?: string;
  fresh: boolean;
}

export interface CctvSystemStatusResponse {
  status: string;
  cctv_time: string;
  cameras: CctvCameraStatus[];
  totals_today: {
    packed_invoices: number;
    active_anomalies: number;
    offline_cameras: number;
  };
}

export interface CctvPackingSummaryResponse {
  date: string;
  total_packed: number;
  by_store: Record<string, number>;
  by_camera: Record<string, number>;
}

async function cctvFetch<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
  const url = `${CCTV_BASE_URL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  try {
    const res = await fetch(url, {
      signal: options?.signal || AbortSignal.timeout(5000),
      ...options,
      headers: {
        Authorization: `Bearer ${CCTV_TOKEN}`,
        "X-CCTV-Token": CCTV_TOKEN,
        Accept: "application/json",
        ...(options?.headers || {}),
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      console.warn(`CCTV API Error [${res.status}]: ${url}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (error) {
    console.error(`Failed to connect to CCTV SLM at ${url}:`, error);
    return null;
  }
}

/**
 * Cek status rekaman dan packing invoice di CCTV SLM
 */
export async function getCctvInvoiceStatus(
  invoiceNumber: string
): Promise<CctvInvoiceResponse | null> {
  if (!invoiceNumber || !invoiceNumber.trim()) return null;
  return cctvFetch<CctvInvoiceResponse>(
    `api/v1/slm/invoices/${encodeURIComponent(invoiceNumber.trim())}`
  );
}

/**
 * Cek kesehatan server, kamera, dan total packing hari ini di CCTV SLM
 */
export async function getCctvSystemStatus(): Promise<CctvSystemStatusResponse | null> {
  return cctvFetch<CctvSystemStatusResponse>("api/v1/slm/status");
}

/**
 * Ambil rekap harian aktivitas packing dari CCTV SLM
 */
export async function getCctvPackingSummary(date?: string): Promise<CctvPackingSummaryResponse | null> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return cctvFetch<CctvPackingSummaryResponse>(`api/v1/slm/packing/summary${query}`);
}

/**
 * Mengambil daftar log event terbaru dari CCTV SLM (dapat difilter berdasarkan type & limit)
 */
export async function getCctvEvents(params?: {
  limit?: number;
  type?: "packing_completed" | "anomaly" | string;
}): Promise<any[] | null> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.type) searchParams.set("type", params.type);
  const qs = searchParams.toString();
  return cctvFetch<any[]>(`api/v1/slm/events${qs ? `?${qs}` : ""}`);
}

