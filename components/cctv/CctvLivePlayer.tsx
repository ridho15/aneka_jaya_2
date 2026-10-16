"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CctvCameraStream } from "@/lib/cctv/streams";

interface CameraCellProps {
  camera: CctvCameraStream;
  autoPlay?: boolean;
  onExpand?: () => void;
  isFocused?: boolean;
}

export function CameraCell({
  camera,
  autoPlay = true,
  onExpand,
  isFocused = false,
}: CameraCellProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "live" | "error" | "offline"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshotSuccess, setSnapshotSuccess] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const cellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hlsRef = useRef<any>(null);

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

  const startStream = useCallback(async () => {
    if (!camera) return;

    setErrorMessage(null);
    setConnectionStatus("connecting");
    cleanupStream();

    const streamUrl = camera.streamUrl;
    const streamType = camera.streamType;

    if (streamType === "iframe") {
      setConnectionStatus("live");
      return;
    }

    if (!streamUrl) {
      setConnectionStatus("offline");
      setErrorMessage("URL siaran belum dikonfigurasi.");
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    try {
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
              setErrorMessage("Sinyal kamera offline.");
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
          setErrorMessage("Browser tidak mendukung HLS.");
        }
      } else if (streamType === "mjpeg" || streamUrl.includes("video_feed") || streamUrl.includes("/live")) {
        // MJPEG didukung secara native via tag img
        setConnectionStatus("live");
      } else {
        videoEl.src = streamUrl;
        videoEl
          .play()
          .then(() => setConnectionStatus("live"))
          .catch(() => {
            setConnectionStatus("live");
          });
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setErrorMessage(err?.message || "Gagal memutar video.");
    }
  }, [camera, cleanupStream]);

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
  }, [isPlaying, camera.streamUrl, startStream, cleanupStream]);

  // Observer untuk auto-pause saat sel kamera di luar viewport
  useEffect(() => {
    const el = cellRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let wasPlayingBeforeHidden = isPlaying;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting && isPlaying) {
          wasPlayingBeforeHidden = true;
          if (videoRef.current) videoRef.current.pause();
        } else if (entry.isIntersecting && wasPlayingBeforeHidden) {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [isPlaying]);

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
    if (!cellRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await cellRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  };

  const takeSnapshot = () => {
    const isMjpeg = camera.streamType === "mjpeg" || Boolean(camera.streamUrl?.includes("/live"));
    const video = videoRef.current;
    const img = imgRef.current;
    const media = isMjpeg ? img : video;
    if (!media) return;

    try {
      const canvas = document.createElement("canvas");
      const width = isMjpeg
        ? ((media as HTMLImageElement).naturalWidth || 1280)
        : ((media as HTMLVideoElement).videoWidth || 1280);
      const height = isMjpeg
        ? ((media as HTMLImageElement).naturalHeight || 720)
        : ((media as HTMLVideoElement).videoHeight || 720);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");

        const link = document.createElement("a");
        const filename = `cctv-${camera.name.toLowerCase().replace(/\s+/g, "-")}-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.png`;
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
      ref={cellRef}
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition-all hover:border-slate-300 ${
        isFocused ? "w-full" : ""
      }`}
    >
      {/* Header Sel Kamera */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              camera.isOnline ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <span className="font-bold text-slate-800 truncate" title={camera.name}>
            {camera.name}
          </span>
          <span className="hidden xl:inline-block text-[10px] text-slate-400 truncate">
            {camera.location || "Meja Packing"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isPlaying && connectionStatus === "live" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Aktif
            </span>
          ) : isPlaying && connectionStatus === "connecting" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Menghubungkan
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
              Standby
            </span>
          )}

          <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            {camera.streamType?.toUpperCase() || "HLS"}
          </span>
        </div>
      </div>

      {/* Frame Video / Screen Area */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden select-none">
        {isPlaying && camera.streamType === "iframe" && camera.embedUrl ? (
          <iframe
            src={camera.embedUrl}
            title={`Pantauan ${camera.name}`}
            className="h-full w-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
          />
        ) : isPlaying && (camera.streamType === "mjpeg" || Boolean(camera.streamUrl?.includes("/live"))) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={camera.streamUrl || ""}
            alt={`Pantauan ${camera.name}`}
            className={`h-full w-full object-contain ${
              isPlaying && connectionStatus === "live" ? "block" : "hidden"
            }`}
            onLoad={() => setConnectionStatus("live")}
            onError={() => {
              setConnectionStatus("offline");
              setErrorMessage("Sinyal kamera offline.");
            }}
          />
        ) : (
          <video
            ref={videoRef}
            className={`h-full w-full object-contain ${
              isPlaying && connectionStatus === "live" ? "block" : "hidden"
            }`}
            playsInline
            muted={isMuted}
            autoPlay={autoPlay}
            preload="auto"
          />
        )}

        {/* Layar Siaga / Offline (Light Surveillance UI) */}
        {(!isPlaying || connectionStatus !== "live") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 mb-2 shadow-2xs">
              {connectionStatus === "connecting" ? (
                <svg className="w-5 h-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            <p className="text-xs font-bold text-slate-800">{camera.name}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{camera.location || "Meja Packing Gudang"}</p>

            {errorMessage ? (
              <p className="mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={togglePlay}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition shadow-2xs active:scale-95"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{isPlaying ? "Sambungkan Ulang" : "Buka Pantauan Kamera"}</span>
            </button>
          </div>
        )}

        {/* Notifikasi Toast Snapshot */}
        {snapshotSuccess && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-md border border-emerald-600 animate-fade-in">
            <svg className="w-3.5 h-3.5 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span>Foto tersimpan</span>
          </div>
        )}
      </div>

      {/* Toolbar Kontrol Bawah Sel */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-slate-600">
        <div className="flex items-center gap-1.5">
          {/* Tombol Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            title={isPlaying ? "Jeda Feed" : "Putar Feed"}
          >
            {isPlaying ? (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Tombol Audio */}
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
            title={isMuted ? "Aktifkan Audio" : "Senyapkan"}
          >
            {isMuted ? (
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Tombol Snapshot */}
          <button
            type="button"
            onClick={takeSnapshot}
            disabled={!isPlaying || connectionStatus !== "live"}
            className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs disabled:opacity-40"
            title="Ambil Cuplikan Foto"
          >
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Foto Frame</span>
          </button>

          {/* Tombol Perbesar / Fokus */}
          {onExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
              title={isFocused ? "Kembali ke Grid" : "Fokus Kamera Ini"}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          ) : null}

          {/* Tombol Fullscreen Layar Penuh */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
            title="Layar Penuh"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface CctvLivePlayerProps {
  cameras: CctvCameraStream[];
  initialCameraId?: string | number;
  autoPlay?: boolean;
  className?: string;
  defaultViewMode?: "grid" | "focus";
}

export function CctvLivePlayer({
  cameras,
  initialCameraId,
  autoPlay = true,
  className = "",
  defaultViewMode = "grid",
}: CctvLivePlayerProps) {
  const activeCameras = cameras && cameras.length > 0 ? cameras : [];
  const [viewMode, setViewMode] = useState<"grid" | "focus">(defaultViewMode);
  const [focusedId, setFocusedId] = useState<string | number>(
    initialCameraId ?? (activeCameras[0]?.id || "cam-1")
  );

  const focusedCamera =
    activeCameras.find((c) => String(c.id) === String(focusedId)) ||
    activeCameras[0];

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xs ${className}`}
    >
      {/* Bar Atas Multi-Kamera */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>{activeCameras.length} Kamera CCTV Terhubung</span>
          </span>
          <span className="hidden sm:inline-block text-xs text-slate-500">
            {viewMode === "grid" ? "Tampilan 3-Channel Grid" : `Fokus: ${focusedCamera?.name || "Kamera"}`}
          </span>
        </div>

        {/* Tombol Pengalih Mode: Grid 3 Kamera vs Fokus 1 Kamera */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-2xs border ${
              viewMode === "grid"
                ? "bg-white text-emerald-800 border-slate-300 shadow-xs"
                : "border-transparent text-slate-600 hover:bg-slate-200/60"
            }`}
            title="Tampilkan ke-3 kamera sekaligus"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Grid 3 Kamera</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("focus")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-2xs border ${
              viewMode === "focus"
                ? "bg-white text-emerald-800 border-slate-300 shadow-xs"
                : "border-transparent text-slate-600 hover:bg-slate-200/60"
            }`}
            title="Tampilkan 1 kamera terpilih secara besar"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>Fokus 1 Kamera</span>
          </button>
        </div>
      </div>

      {/* Konten Pemutar: Mode Grid (3 Kamera) atau Mode Fokus (1 Kamera Besar) */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 p-3.5 bg-slate-100/40">
          {activeCameras.map((cam) => (
            <CameraCell
              key={cam.id}
              camera={cam}
              autoPlay={autoPlay}
              onExpand={() => {
                setFocusedId(cam.id);
                setViewMode("focus");
              }}
            />
          ))}
          {activeCameras.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-slate-400">
              Tidak ada feed kamera yang terkonfigurasi.
            </div>
          )}
        </div>
      ) : (
        /* Mode Fokus */
        <div className="flex flex-col p-3.5 bg-slate-100/40 gap-3">
          {/* Sub-selector kamera dalam mode fokus */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5">
              {activeCameras.map((cam) => {
                const isSelected = String(cam.id) === String(focusedId);
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setFocusedId(cam.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-2xs border ${
                      isSelected
                        ? "bg-white text-emerald-800 border-slate-300 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-white"
                    }`}
                  >
                    {cam.name}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className="text-xs font-semibold text-emerald-700 hover:underline shrink-0"
            >
              ← Kembali ke Grid 3 Kamera
            </button>
          </div>

          {focusedCamera ? (
            <CameraCell
              camera={focusedCamera}
              autoPlay={autoPlay}
              isFocused={true}
              onExpand={() => setViewMode("grid")}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
