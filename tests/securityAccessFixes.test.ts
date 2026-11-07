/** Regresi audit keamanan: siaran CCTV hanya Owner, proxy bukti CCTV hanya path bukti, cron menolak placeholder, harga modal disembunyikan. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const session = vi.hoisted(() => ({ user: { id: "u1", name: "U", role: "VIEWER" as string } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => session.user),
  getCurrentRole: vi.fn(async () => session.user.role)
}));
vi.mock("@/lib/api/products", () => ({
  getProduct: vi.fn(async () => ({ success: true, data: { id: "p-a", sku: "SKU-A", name: "Barang A", costPrice: 41234, price: 60000 } })),
  updateProduct: vi.fn(),
  deactivateProduct: vi.fn()
}));

import { GET as liveStream } from "@/app/api/cctv/stream/[cameraId]/live/route";
import { GET as evidence } from "@/app/api/cctv/evidence/route";
import { GET as productDetail } from "@/app/api/products/[id]/route";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";

const fetchMock = vi.fn(async () => new Response("FRAME", { status: 200, headers: { "content-type": "image/jpeg" } }));
const params = (cameraId: string) => ({ params: Promise.resolve({ cameraId }) });

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("live CCTV relay", () => {
  it.each(["VIEWER", "DELIVERY_DRIVER", "ADMIN", "FINANCE", "MANAGER", "SUPERVISOR"])("refuses %s without contacting the CCTV server", async (role) => {
    session.user = { id: "u1", name: "U", role };
    const res = await liveStream(new NextRequest("http://localhost/api/cctv/stream/1/live"), params("1"));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the owner", async () => {
    session.user = { id: "boss", name: "Boss", role: "OWNER" };
    const res = await liveStream(new NextRequest("http://localhost/api/cctv/stream/1/live"), params("1"));
    expect(res.status).toBe(200);
  });

  it("rejects odd camera ids", async () => {
    session.user = { id: "boss", name: "Boss", role: "OWNER" };
    const res = await liveStream(new NextRequest("http://localhost/api/cctv/stream/1/live"), params("../admin"));
    expect(res.status).toBe(404);
  });
});

describe("CCTV evidence proxy", () => {
  beforeEach(() => { session.user = { id: "u1", name: "U", role: "ADMIN" }; });

  it.each(["/api/v1/slm/status", "/api/v1/slm/evidence/../status", "/cameras/1/stream", "http://203.0.113.10:8000/api/v1/admin/x"])("refuses non-evidence path %s", async (url) => {
    const res = await evidence(new NextRequest(`http://localhost/api/cctv/evidence?url=${encodeURIComponent(url)}`));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still serves label and evidence snapshots, privately cached", async () => {
    for (const url of ["/labels/16", "/api/v1/slm/evidence/label-snapshot/32"]) {
      const res = await evidence(new NextRequest(`http://localhost/api/cctv/evidence?url=${encodeURIComponent(url)}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("private");
    }
  });
});

describe("cron secret", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => { process.env.CRON_SECRET = original; });
  const call = (secret: string) => rejectIfInvalidCron(new Request(`http://localhost/api/jobs/x?secret=${secret}`));

  it("rejects the .env.example placeholder even when configured", () => {
    process.env.CRON_SECRET = "change-me";
    expect(call("change-me")?.status).toBe(401);
  });

  it("accepts a real secret and rejects a wrong one", () => {
    process.env.CRON_SECRET = "a-real-long-random-secret";
    expect(call("a-real-long-random-secret")).toBeNull();
    expect(call("wrong")?.status).toBe(401);
  });
});

describe("product detail cost price", () => {
  it("hides cost price from ADMIN", async () => {
    session.user = { id: "u1", name: "U", role: "ADMIN" };
    const body = await (await productDetail(new Request("http://localhost/api/products/p-a"), { params: Promise.resolve({ id: "p-a" }) })).json();
    expect(body.data.price).toBe(60000);
    expect(body.data).not.toHaveProperty("costPrice");
  });

  it("keeps cost price for OWNER", async () => {
    session.user = { id: "boss", name: "Boss", role: "OWNER" };
    const body = await (await productDetail(new Request("http://localhost/api/products/p-a"), { params: Promise.resolve({ id: "p-a" }) })).json();
    expect(body.data.costPrice).toBe(41234);
  });
});
