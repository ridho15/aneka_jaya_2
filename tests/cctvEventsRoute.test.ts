import { describe, it, expect, beforeAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import { POST } from "@/app/api/cctv/events/route";
import {
  getCctvInvoiceStatus,
  getCctvSystemStatus,
  getCctvPackingSummary,
} from "@/lib/cctv/client";
import { prisma } from "@/lib/db/prisma";

const TOKEN =
  process.env.SLM_API_TOKEN ||
  process.env.CCTV_INTEGRATION_TOKEN ||
  "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";

describe("CCTV Events Webhook Receiver (app/api/cctv/events/route.ts)", () => {
  let sampleSales: any;

  beforeAll(async () => {
    sampleSales = await prisma.salesRecord.findFirst({
      include: { deliveryOrder: true },
    });
  });

  it("should return 401 when token header is missing", async () => {
    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "packing_completed" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 401 when token is invalid", async () => {
    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Token": "invalid_random_secret_token",
      },
      body: JSON.stringify({ event_type: "packing_completed" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should accept valid token via X-CCTV-Token header", async () => {
    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Token": TOKEN,
      },
      body: JSON.stringify({
        event_id: "evt-test-1",
        event_type: "camera_offline",
        severity: "warning",
        title: "Kamera 14 Terputus",
        message: "Meja Packing 2 offline",
        camera: { id: 14, name: "Meja Packing 2" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.received_id).toBe("evt-test-1");
  });

  it("should accept valid token via Authorization Bearer header", async () => {
    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        event_id: "evt-test-bearer",
        event_type: "desk_empty",
        severity: "warning",
        title: "Meja Kosong",
        message: "Petugas meninggalkan meja packing",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("should accept valid HMAC-SHA256 signature in X-CCTV-Signature header", async () => {
    const bodyStr = JSON.stringify({
      event_id: "evt-test-hmac",
      event_type: "anomaly",
      severity: "critical",
      title: "Anomali Terdeteksi",
      message: "Barang keluar meja tanpa lakban",
    });

    const signature =
      "sha256=" + crypto.createHmac("sha256", TOKEN).update(bodyStr).digest("hex");

    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Signature": signature,
      },
      body: bodyStr,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.received_id).toBe("evt-test-hmac");
  });

  it("should return 400 when event_type is missing", async () => {
    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Token": TOKEN,
      },
      body: JSON.stringify({ message: "No event type" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should handle packing_completed and update SalesRecord if match exists", async () => {
    if (!sampleSales) return;

    const payload = {
      event_id: "evt-pack-completed-test",
      event_type: "packing_completed",
      severity: "info",
      title: `Packing Selesai: #${sampleSales.transactionNumber || sampleSales.id}`,
      message: `Invoice #${sampleSales.transactionNumber || sampleSales.id} selesai dipacking`,
      occurred_at: new Date().toISOString(),
      camera: { id: 1, name: "Meja Packing 1", location: "Gudang Utama" },
      data: {
        invoice_number: sampleSales.transactionNumber || sampleSales.id,
        customer_name: sampleSales.customerName,
        source_label: "Shopee",
        packing_completed_at: new Date().toISOString(),
      },
    };

    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Token": TOKEN,
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");

    // Verify database update
    const updated = await prisma.salesRecord.findUnique({
      where: { id: sampleSales.id },
      include: { deliveryOrder: true },
    });
    expect(updated?.doPackingStatus).toBe("sudah");
    if (updated?.deliveryOrder) {
      expect(updated.deliveryOrder.packingStatus).toBe("sudah");
    }
  });

  it("should process official documentation payload for packing_completed with dual evidence_url and slm_reference", async () => {
    const officialPayload = {
      event_id: "cctv_pack_28_1773412345",
      event_type: "packing_completed",
      severity: "info",
      title: "Packing Selesai: #101026-31",
      message: "Invoice #101026-31 (ARI BOGOR) selesai dibungkus di Meja Packing 1 dan siap dikirim.",
      occurred_at: "2026-10-13T22:00:00+07:00",
      evidence_url:
        "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/28?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
      camera: {
        id: 1,
        name: "Meja Packing 1",
        location: "Gudang Aneka Jaya",
      },
      data: {
        label_id: 28,
        invoice_number: "101026-31",
        customer_name: "ARI BOGOR",
        source_label: "Aneka Jaya",
        slm_reference: "SO-101026-31",
        packing_completed_at: "2026-10-13T22:00:00+07:00",
        evidence_url:
          "http://31.97.51.194:8000/api/v1/slm/evidence/label-snapshot/28?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
      },
    };

    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(officialPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.received_id).toBe("cctv_pack_28_1773412345");

    // Verify detection log was created with correct evidenceUrl and label_id
    const log = await prisma.cctvDetectionLog.findFirst({
      where: { invoiceNumber: "101026-31" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.cctvLabelId).toBe(28);
    expect(log?.customerName).toBe("ARI BOGOR");
    expect(log?.evidenceUrl).toContain("label-snapshot/28");
  });

  it("should process official documentation payload for anomaly with incident_id, clip_url, and evidence_url", async () => {
    const officialAnomalyPayload = {
      event_id: "cctv_inc_12_1773412345",
      event_type: "anomaly",
      severity: "critical",
      title: "Dugaan Anomali Meja Packing (Meja Packing 1)",
      message:
        "Barang dikeluarkan dari area meja packing tanpa melalui rute packing resmi pada Meja Packing 1.",
      occurred_at: "2026-10-13T22:05:00+07:00",
      evidence_url:
        "http://31.97.51.194:8000/api/v1/slm/evidence/incident-snapshot/12?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
      clip_url:
        "http://31.97.51.194:8000/api/v1/slm/evidence/incident-clip/12?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
      camera: {
        id: 1,
        name: "Meja Packing 1",
        location: "Gudang Aneka Jaya",
      },
      data: {
        incident_id: 12,
        item_count: 1,
        reason: "Barang dikeluarkan tanpa rute packing resmi",
        evidence_url:
          "http://31.97.51.194:8000/api/v1/slm/evidence/incident-snapshot/12?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
        clip_url:
          "http://31.97.51.194:8000/api/v1/slm/evidence/incident-clip/12?token=cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b",
      },
    };

    const req = new Request("http://localhost/api/cctv/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CCTV-Token": TOKEN,
      },
      body: JSON.stringify(officialAnomalyPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.received_id).toBe("cctv_inc_12_1773412345");

    // Verify detection log has anomaly and incident_id mapped
    const log = await prisma.cctvDetectionLog.findFirst({
      where: { eventType: "anomaly" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.eventType).toBe("anomaly");
    expect(log?.evidenceUrl).toContain("incident-snapshot/12");
  });
});

describe("CCTV Pull API Client (lib/cctv/client.ts)", () => {
  it("should fetch invoice status successfully", async () => {
    const mockResponse = {
      found: true,
      invoice_number: "121026-03",
      customer_name: "NR Beauty",
      store_source: "Shopee",
      packing_status: "completed",
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    try {
      const result = await getCctvInvoiceStatus("121026-03");
      expect(result).not.toBeNull();
      expect(result?.found).toBe(true);
      expect(result?.invoice_number).toBe("121026-03");
      expect(result?.customer_name).toBe("NR Beauty");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should return null for empty invoice number", async () => {
    const result = await getCctvInvoiceStatus("");
    expect(result).toBeNull();
  });

  it("should fetch system status successfully", async () => {
    const mockResponse = {
      status: "healthy",
      cctv_time: "2026-10-13T10:30:00+07:00",
      cameras: [{ id: 1, name: "Meja 1", status: "online", detector_ready: true, fresh: true }],
      totals_today: { packed_invoices: 45, active_anomalies: 0, offline_cameras: 0 },
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    try {
      const result = await getCctvSystemStatus();
      expect(result).not.toBeNull();
      expect(result?.status).toBe("healthy");
      expect(result?.cameras.length).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should fetch packing summary successfully", async () => {
    const mockResponse = {
      date: "2026-10-13",
      total_packed: 45,
      by_store: { Shopee: 30, Tokopedia: 15 },
      by_camera: { "Meja 1": 45 },
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    try {
      const result = await getCctvPackingSummary("2026-10-13");
      expect(result).not.toBeNull();
      expect(result?.total_packed).toBe(45);
      expect(result?.by_store.Shopee).toBe(30);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
