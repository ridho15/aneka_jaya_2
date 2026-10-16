import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// Mock auth session to return OWNER role
vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn().mockResolvedValue("OWNER"),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "admin-1", role: "OWNER" }),
}));

import {
  sanitizeCctvEvidenceUrl,
  sanitizeLocalPhotoUrl,
} from "@/lib/cctv/store";
import {
  resolveCameraStreamUrl,
  getConfiguredCameraStreams,
} from "@/lib/cctv/streams";
import { GET as getEvidenceProxy } from "@/app/api/cctv/evidence/route";
import { GET as getStreamRelay } from "@/app/api/cctv/stream/[cameraId]/live/route";

describe("CCTV HTTPS Proxy & Evidence Relay Integration", () => {
  describe("1. Evidence URL Sanitizer & Rewriter", () => {
    it("rewrites http://localhost:8000/labels/34 to internal HTTPS proxy URL", () => {
      const rawUrl = "http://localhost:8000/labels/34";
      const sanitized = sanitizeCctvEvidenceUrl(rawUrl);

      expect(sanitized).toBe(
        `/api/cctv/evidence?url=${encodeURIComponent(rawUrl)}`
      );
    });

    it("rewrites http://localhost:8000/api/v1/slm/evidence/label-snapshot/... to proxy URL", () => {
      const rawUrl =
        "http://localhost:8000/api/v1/slm/evidence/label-snapshot/34?token=test-token";
      const sanitized = sanitizeCctvEvidenceUrl(rawUrl);

      expect(sanitized).toBe(
        `/api/cctv/evidence?url=${encodeURIComponent(rawUrl)}`
      );
    });

    it("rewrites VPS direct IP http://31.97.51.194:8000/labels/16 to proxy URL", () => {
      const rawUrl = "http://31.97.51.194:8000/labels/16";
      const sanitized = sanitizeCctvEvidenceUrl(rawUrl);

      expect(sanitized).toBe(
        `/api/cctv/evidence?url=${encodeURIComponent(rawUrl)}`
      );
    });

    it("preserves already proxied /api/cctv/evidence URLs without double-encoding", () => {
      const proxyUrl = "/api/cctv/evidence?labelId=34";
      expect(sanitizeCctvEvidenceUrl(proxyUrl)).toBe(proxyUrl);
    });

    it("handles null, undefined, or empty string gracefully", () => {
      expect(sanitizeCctvEvidenceUrl(null)).toBeNull();
      expect(sanitizeCctvEvidenceUrl(undefined)).toBeNull();
      expect(sanitizeCctvEvidenceUrl("")).toBeNull();
      expect(sanitizeCctvEvidenceUrl("   ")).toBeNull();
    });

    it("maintains backward compatibility with sanitizeLocalPhotoUrl alias", () => {
      expect(sanitizeLocalPhotoUrl).toBe(sanitizeCctvEvidenceUrl);
    });
  });

  describe("2. Camera Stream URL Resolver for Mixed Content Prevention", () => {
    it("resolves stream URL to internal HTTPS relay route by default", () => {
      const url = resolveCameraStreamUrl("cam-1");
      expect(url).toBe("/api/cctv/stream/cam-1/live");

      const numUrl = resolveCameraStreamUrl(1);
      expect(numUrl).toBe("/api/cctv/stream/1/live");
    });

    it("preserves external HTTPS stream URL if provided in environment override", () => {
      const httpsUrl = "https://cctv.aneka-jaya.com/hls/cam1.m3u8";
      const resolved = resolveCameraStreamUrl("1", httpsUrl);
      expect(resolved).toBe(httpsUrl);
    });

    it("configures cameras with HTTPS proxy routes when live cameras reported", () => {
      const liveCams = [
        {
          id: 1,
          name: "Camera 14",
          location: "Meja Packing",
          status: "online" as const,
          fps: 3,
          detector_ready: true,
          fresh: true,
        },
        {
          id: 2,
          name: "Camera 13",
          location: "Area Dus",
          status: "offline" as const,
          fps: 3,
          detector_ready: false,
          fresh: false,
        },
      ];

      const streams = getConfiguredCameraStreams(liveCams);
      expect(streams[0].streamUrl).toBe("/api/cctv/stream/1/live");
      expect(streams[1].streamUrl).toBe("/api/cctv/stream/2/live");
    });
  });

  describe("3. Evidence Proxy Endpoint (/api/cctv/evidence)", () => {
    it("returns 400 when neither url nor labelId is provided", async () => {
      const req = new NextRequest("http://localhost:3000/api/cctv/evidence");
      const res = await getEvidenceProxy(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("diperlukan");
    });

    it("blocks SSRF attempts on disallowed arbitrary hosts", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/cctv/evidence?url=http://malicious-site.com/secret.jpg"
      );
      const res = await getEvidenceProxy(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("tidak diizinkan");
    });

    it("fetches evidence from upstream CCTV server and returns with image headers", async () => {
      const fakeImageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(fakeImageBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      );

      const req = new NextRequest(
        "http://localhost:3000/api/cctv/evidence?labelId=34"
      );
      const res = await getEvidenceProxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("cache-control")).toContain("public");

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("label-snapshot/34"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
        })
      );

      fetchSpy.mockRestore();
    });

    it("gracefully returns 404 when upstream image is not found", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(null, {
          status: 404,
          statusText: "Not Found",
        })
      );

      const req = new NextRequest(
        "http://localhost:3000/api/cctv/evidence?url=http://localhost:8000/labels/999"
      );
      const res = await getEvidenceProxy(req);

      expect(res.status).toBe(404);
      fetchSpy.mockRestore();
    });
  });

  describe("4. Stream Relay Endpoint (/api/cctv/stream/[cameraId]/live)", () => {
    it("returns 503 error when upstream camera feed is unreachable", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED 31.97.51.194:8000"));

      const req = new NextRequest(
        "http://localhost:3000/api/cctv/stream/1/live"
      );
      const res = await getStreamRelay(req, {
        params: Promise.resolve({ cameraId: "1" }),
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.isOnline).toBe(false);
      expect(json.error).toContain("Gagal menghubungkan");

      fetchSpy.mockRestore();
    });

    it("relays stream response with multipart or video headers when upstream is active", async () => {
      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(fakeStream, {
          status: 200,
          headers: {
            "content-type": "multipart/x-mixed-replace; boundary=frame",
          },
        })
      );

      const req = new NextRequest(
        "http://localhost:3000/api/cctv/stream/1/live"
      );
      const res = await getStreamRelay(req, {
        params: Promise.resolve({ cameraId: "1" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("multipart/x-mixed-replace");
      expect(res.headers.get("cache-control")).toContain("no-cache");

      fetchSpy.mockRestore();
    });
  });
});
