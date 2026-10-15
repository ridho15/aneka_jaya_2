"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CctvCameraStream, CctvStreamType } from "@/lib/cctv/streams";

interface CctvLivePlayerProps {
  cameras: CctvCameraStream[];
  initialCameraId?: string | number;
  autoPlay?: boolean;
  className?: string;
}

export function CctvLivePlayer({
  cameras,
  initialCameraId,
  autoPlay = false,
  className = "",
}: CctvLivePlayerProps) {
  const activeCameras = cameras && cameras.length > 0 ? cameras : [];
  const [selectedId, setSelectedId] = useState<string | number>(
    initialCameraId ?? (activeCameras[0]?.id || "cam-1")
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "live" | "error" | "offline"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);

  const currentCamera =
    activeCameras.find((c) => String(c.id) === String(selectedId)) ||
    activeCameras[0];

  // Bersihkan player instance sebelumnya
  const cleanupStream = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (err) {
        console.warn("Gagal membersihkan Hls instance:", err);
      }
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  // Inisialisasi stream player
  const startStream = useCallback(async () => {
    if (!currentCamera) return;

    setErrorMessage(null);
    setConnectionStatus("connecting");
    cleanupStream();

    const streamUrl = currentCamera.streamUrl;
    const streamType = currentCamera.streamType;

    // Jika streamType adalah iframe, tidak perlu binding ke HTML5 video
    if (streamType === "iframe") {
      setConnectionStatus("live");
      return;
    }

    if (!streamUrl) {
      setConnectionStatus("offline");
      setErrorMessage("URL siaran kamera belum dikonfigurasi.");
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    try {
      // Protokol HLS (.m3u8)
      if (streamType === "hls" || streamUrl.includes(".m3u8")) {
        const HlsModule = (await import("hls.js")).default;
        if (HlsModule.isSupported()) {
          const hls = new HlsModule({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoEl);

          hls.on(HlsModule.Events.MANIFEST_PARSED, () => {
            videoEl
              .play()
              .then(() => setConnectionStatus("live"))
              .catch(() => setConnectionStatus("idle"));
          });

          hls.on(HlsModule.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              setConnectionStatus("offline");
              setErrorMessage("Sinyal HLS kamera offline atau terputus.");
            }
          });
        } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
          videoEl.src = streamUrl;
          videoEl
            .play()
            .then(() => setConnectionStatus("live"))
            .catch(() => setConnectionStatus("idle"));
        } else {
          setConnectionStatus("error");
          setErrorMessage("Browser tidak mendukung pemutaran protokol HLS.");
        }
      }
      // Protokol MJPEG / Direct HTTP Stream
      else if (streamType === "mjpeg" || streamUrl.includes("video_feed")) {
        videoEl.src = streamUrl;
        videoEl
          .play()
          .then(() => setConnectionStatus("live"))
          .catch(() => {
            // MJPEG seringkali stream gambar berkelanjutan
            setConnectionStatus("live");
          });
      }
      // Protokol Standar / Fallback
      else {
        videoEl.src = streamUrl;
        videoEl
          .play()
          .then(() => setConnectionStatus("live"))
          .catch(() => {
            setConnectionStatus("offline");
            setErrorMessage("Kamera fisik sedang standby atau offline.");
          });
      }
    } catch (err: any) {
      console.warn("CCTV player connection issue:", err);
      setConnectionStatus("offline");
      setErrorMessage("Kamera fisik sedang standby atau offline.");
    }
  }, [currentCamera, cleanupStream]);

  // Efek ganti kamera atau play/pause
  useEffect(() => {
    if (isPlaying) {
      startStream();
    } else {
      cleanupStream();
      setConnectionStatus("idle");
    }

    return () => {
      cleanupStream();
    };
  }, [isPlaying, selectedId, startStream, cleanupStream]);

  // Optimasi Bandwidth: IntersectionObserver & Page Visibility API
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Observer saat viewport keluar layar
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting && isPlaying) {
          // Pause sementara saat discroll jauh keluar layar
          if (videoRef.current) {
            videoRef.current.pause();
          }
        } else if (entry && entry.isIntersecting && isPlaying) {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(container);

    // 2. Observer saat tab browser disembunyikan/minimize
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        if (videoRef.current) videoRef.current.pause();
      } else if (!document.hidden && isPlaying) {
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying]);

  // Fullscreen Change Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted((prev) => !prev);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");

        const link = document.createElement("a");
        const filename = `cctv-snapshot-${currentCamera?.name || "camera"}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setSnapshotSuccess(true);
        setTimeout(() => setSnapshotSuccess(false), 2500);
      }
    } catch (err) {
      console.warn("Gagal mengambil snapshot frame:", err);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl ${className}`}
    >
      {/* Bar Navigasi Multi-Kamera */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-3.5 py-2.5 backdrop-blur-sm gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {activeCameras.map((cam) => {
            const isSelected = String(cam.id) === String(selectedId);
            return (
              <button
                key={cam.id}
                type="button"
                onClick={() => {
                  setSelectedId(cam.id);
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    cam.isOnline
                      ? "bg-emerald-300 animate-pulse"
                      : isSelected
                      ? "bg-emerald-200"
                      : "bg-slate-500"
                  }`}
                />
                <span>{cam.name}</span>
              </button>
            );
          })}
        </div>

        {/* Status Indikator Live & Resolusi */}
        <div className="flex items-center gap-2">
          {isPlaying && connectionStatus === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          ) : isPlaying && connectionStatus === "connecting" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-400 border border-amber-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Menyambungkan
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-700">
              Standby
            </span>
          )}

          <span className="hidden sm:inline-block rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {currentCamera?.streamType?.toUpperCase() || "HLS"} • 1080p
          </span>
        </div>
      </div>

      {/* Frame Tampilan Video / Screen Area */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden select-none">
        {/* Iframe View jika tipe iframe */}
        {isPlaying && currentCamera?.streamType === "iframe" && currentCamera.embedUrl ? (
          <iframe
            src={currentCamera.embedUrl}
            title={`Live Stream ${currentCamera.name}`}
            className="h-full w-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
          />
        ) : (
          /* HTML5 Video Element */
          <video
            ref={videoRef}
            className={`h-full w-full object-contain ${
              isPlaying && connectionStatus === "live" ? "block" : "hidden"
            }`}
            playsInline
            muted={isMuted}
            preload="none"
          />
        )}

        {/* Layar Standby / Offline State */}
        {(!isPlaying || connectionStatus !== "live") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center">
            {/* Background grid motif subtle */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

            <div className="relative z-10 flex flex-col items-center max-w-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-400 mb-3 shadow-inner">
                {connectionStatus === "connecting" ? (
                  <svg
                    className="w-7 h-7 animate-spin text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-7 h-7 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </div>

              <h4 className="text-sm font-bold text-slate-200">
                {currentCamera?.name || "Kamera Meja Packing"}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentCamera?.location || "Area Meja Packing Gudang"}
              </p>

              {errorMessage && (
                <p className="mt-2 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
                  {errorMessage}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-md active:scale-95"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>{isPlaying ? "Coba Sambungkan Lagi" : "Mulai Siaran Live"}</span>
                </button>

                <a
                  href="https://cctvslm.playgo.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  <span>Web CCTV SLM</span>
                  <span className="text-slate-500">↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Notifikasi Toast Snapshot Berhasil */}
        {snapshotSuccess && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xl animate-fade-in">
            <svg
              className="w-4 h-4 text-emerald-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Tangkapan layar frame CCTV berhasil disimpan!</span>
          </div>
        )}
      </div>

      {/* Kontrol Player Bawah (Glassmorphic Bar) */}
      <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-900/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* Tombol Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition active:scale-95 shadow-sm"
            title={isPlaying ? "Hentikan Siaran" : "Putar Siaran"}
          >
            {isPlaying ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Tombol Mute / Unmute */}
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title={isMuted ? "Aktifkan Suara" : "Matikan Suara"}
          >
            {isMuted ? (
              <svg
                className="w-4 h-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </button>

          <span className="text-xs text-slate-400 font-medium">
            {isPlaying
              ? "Siaran Aktif (On-Demand)"
              : "Siaran Dijeda (Hemat Bandwidth)"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Tombol Snapshot / Tangkapan Frame */}
          <button
            type="button"
            onClick={takeSnapshot}
            disabled={!isPlaying || connectionStatus !== "live"}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-40 disabled:pointer-events-none"
            title="Ambil Foto Frame Saat Ini"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="hidden sm:inline">Foto Frame</span>
          </button>

          {/* Tombol Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          >
            {isFullscreen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
