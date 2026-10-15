import type { CctvCameraStatus } from "./client";

export type CctvStreamType = "auto" | "webrtc" | "hls" | "mjpeg" | "iframe";

export interface CctvCameraStream {
  id: string | number;
  name: string;
  location: string;
  streamType: CctvStreamType;
  streamUrl?: string | null;
  embedUrl?: string | null;
  posterUrl?: string | null;
  isOnline: boolean;
  fps?: number;
  lastSeenAt?: string | null;
}

const DEFAULT_CCTV_BASE_URL =
  process.env.CCTV_BASE_URL || "http://31.97.51.194:8000";

/**
 * Mendeteksi tipe stream berdasarkan ekstensi atau protokol URL
 */
export function detectStreamType(url?: string | null): CctvStreamType {
  if (!url) return "auto";
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes("whep") || lower.startsWith("webrtc://") || lower.includes("/webrtc")) {
    return "webrtc";
  }
  if (
    lower.includes("video_feed") ||
    lower.includes("mjpeg") ||
    lower.includes(".mjpg") ||
    lower.includes("/stream")
  ) {
    return "mjpeg";
  }
  if (lower.includes("/embed") || lower.includes("live-embed") || lower.includes(".html")) {
    return "iframe";
  }
  return "auto";
}

/**
 * Mengambil konfigurasi daftar kamera streaming aktif untuk Dashboard Super Admin.
 * Menggabungkan variabel lingkungan .env dan data kamera dari VPS CCTV SLM.
 */
export function getConfiguredCameraStreams(
  liveCameras?: CctvCameraStatus[] | null
): CctvCameraStream[] {
  const isEnabled = process.env.CCTV_LIVE_STREAM_ENABLED !== "false";
  if (!isEnabled) {
    return [];
  }

  const globalStreamType = (process.env.CCTV_STREAM_TYPE as CctvStreamType) || "auto";
  const baseUrl = DEFAULT_CCTV_BASE_URL.replace(/\/+$/, "");

  // URL override per kamera dari .env
  const cam1Url = process.env.CCTV_STREAM_URL_CAM1 || `${baseUrl}/stream/camera1`;
  const cam2Url = process.env.CCTV_STREAM_URL_CAM2 || `${baseUrl}/stream/camera2`;
  const cam3Url = process.env.CCTV_STREAM_URL_CAM3 || `${baseUrl}/stream/camera3`;
  const embedUrl = process.env.CCTV_EMBED_URL || "https://cctvslm.playgo.id/live-embed";

  // Jika ada live cameras yang dilaporkan oleh CCTV VPS API
  if (liveCameras && liveCameras.length > 0) {
    return liveCameras.map((cam, index) => {
      let streamUrl = cam1Url;
      if (index === 1) streamUrl = cam2Url;
      else if (index >= 2) streamUrl = cam3Url;

      // Jika URL spesifik belum diset per-cam, bangun URL default berdasarkan ID kamera
      if (!process.env[`CCTV_STREAM_URL_CAM${index + 1}`]) {
        streamUrl = `${baseUrl}/cameras/${cam.id}/stream`;
      }

      const streamType =
        globalStreamType !== "auto" ? globalStreamType : detectStreamType(streamUrl);

      return {
        id: cam.id,
        name: cam.name || `Kamera ${cam.id}`,
        location: cam.location || "Meja Packing Gudang",
        streamType,
        streamUrl,
        embedUrl,
        isOnline: cam.status === "online" && cam.fresh,
        fps: cam.fps || 3,
        lastSeenAt: cam.lastSeenAt || cam.last_seen_at || null,
      };
    });
  }

  // Fallback kamera default jika API VPS belum memberikan daftar kamera spesifik
  return [
    {
      id: "cam-1",
      name: "Meja Packing 1",
      location: "Meja Packing Utama Gudang",
      streamType: globalStreamType !== "auto" ? globalStreamType : detectStreamType(cam1Url),
      streamUrl: cam1Url,
      embedUrl,
      isOnline: false,
      fps: 3,
    },
    {
      id: "cam-2",
      name: "Meja Packing 2",
      location: "Meja Packing Sekunder / Dus",
      streamType: globalStreamType !== "auto" ? globalStreamType : detectStreamType(cam2Url),
      streamUrl: cam2Url,
      embedUrl,
      isOnline: false,
      fps: 3,
    },
  ];
}
