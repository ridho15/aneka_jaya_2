import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import {
  detectStreamType,
  getConfiguredCameraStreams,
  type CctvCameraStream,
} from "@/lib/cctv/streams";
import { CctvLivePlayer } from "@/components/cctv/CctvLivePlayer";
import { CctvDashboardWidget } from "@/components/dashboard/CctvDashboardWidget";

describe("CCTV Live Streaming Player & Dashboard Integration", () => {
  describe("1. Stream Protocol Detection & Configuration", () => {
    it("detects HLS stream format accurately", () => {
      expect(detectStreamType("https://stream.test/live/camera1.m3u8")).toBe("hls");
      expect(detectStreamType("http://localhost:8000/hls/cam1/index.m3u8")).toBe("hls");
    });

    it("detects WebRTC / WHEP stream format accurately", () => {
      expect(detectStreamType("webrtc://stream.test/live")).toBe("webrtc");
      expect(detectStreamType("https://stream.test/whep/camera1")).toBe("webrtc");
    });

    it("detects MJPEG / video_feed stream format accurately", () => {
      expect(detectStreamType("http://31.97.51.194:8000/video_feed")).toBe("mjpeg");
      expect(detectStreamType("http://localhost:8000/stream/cam1.mjpg")).toBe("mjpeg");
    });

    it("detects iframe embed format accurately", () => {
      expect(detectStreamType("https://cctvslm.playgo.id/live-embed")).toBe("iframe");
      expect(detectStreamType("http://31.97.51.194:8000/embed/cam1")).toBe("iframe");
    });

    it("returns default configured cameras when no dynamic camera list provided", () => {
      const streams = getConfiguredCameraStreams();
      expect(streams.length).toBeGreaterThanOrEqual(2);
      expect(streams[0].name).toBe("Meja Packing 1");
      expect(streams[1].name).toBe("Meja Packing 2");
    });

    it("maps dynamic live cameras from VPS API into camera stream models", () => {
      const liveCams = [
        {
          id: 1,
          name: "Camera 14",
          location: "Meja Packing",
          status: "online" as const,
          fps: 25,
          detector_ready: true,
          fresh: true,
        },
        {
          id: 2,
          name: "Camera 13",
          location: "Area Dus",
          status: "offline" as const,
          fps: 15,
          detector_ready: false,
          fresh: false,
        },
      ];

      const streams = getConfiguredCameraStreams(liveCams);
      expect(streams.length).toBe(2);
      expect(streams[0].id).toBe(1);
      expect(streams[0].name).toBe("Camera 14");
      expect(streams[0].isOnline).toBe(true);
      expect(streams[1].id).toBe(2);
      expect(streams[1].isOnline).toBe(false);
    });
  });

  describe("2. CctvLivePlayer Component Rendering & Controls", () => {
    const mockCameras: CctvCameraStream[] = [
      {
        id: "cam-1",
        name: "Meja Packing 1",
        location: "Meja Utama Gudang",
        streamType: "hls",
        streamUrl: "https://cctv.test/cam1.m3u8",
        embedUrl: "https://cctvslm.playgo.id/live-embed",
        isOnline: true,
        fps: 25,
      },
      {
        id: "cam-2",
        name: "Meja Packing 2",
        location: "Meja Sekunder Gudang",
        streamType: "mjpeg",
        streamUrl: "http://31.97.51.194:8000/video_feed",
        embedUrl: "https://cctvslm.playgo.id/live-embed",
        isOnline: false,
        fps: 15,
      },
    ];

    it("renders camera switcher tabs, standby screen, and control bar", () => {
      const html = renderToStaticMarkup(<CctvLivePlayer cameras={mockCameras} />);

      expect(html).toContain("Meja Packing 1");
      expect(html).toContain("Meja Packing 2");
      expect(html).toContain("Mulai Siaran Live");
      expect(html).toContain("Foto Frame");
      expect(html).toContain("Standby");
    });

    it("strictly contains zero raw tacky emojis and only clean SVG icons", () => {
      const html = renderToStaticMarkup(<CctvLivePlayer cameras={mockCameras} />);

      const hasEmoji = (text: string) =>
        /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text) || /[\u2600-\u27BF]/.test(text);
      expect(hasEmoji(html)).toBe(false);

      expect(html).toContain("<svg");
      expect(html).toContain("viewBox=\"0 0 24 24\"");
    });
  });

  describe("3. CctvDashboardWidget Integration with Live Player", () => {
    it("renders integrated live player alongside KPI cards in split view", () => {
      const html = renderToStaticMarkup(
        <CctvDashboardWidget
          summary={{
            today: { totalPacked: 10, totalDetections: 30, totalAnomalies: 0 },
            recentPacked: [],
            liveSystem: { status: "online", cameras: [] },
          }}
        />
      );

      expect(html).toContain("Pengawasan Meja Packing CCTV");
      expect(html).toContain("Sembunyikan Siaran");
      expect(html).toContain("Mulai Siaran Live");
      expect(html).toContain("Selesai Packing");
      expect(html).toContain("Total Deteksi Meja");
      expect(html).toContain("Belum ada paket yang dipacking hari ini");
    });
  });
});
