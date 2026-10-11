"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { compressImage } from "@/lib/utils/imageCompression";
import { parseReceiptPhotos, serializeReceiptPhotos } from "@/lib/deliveryOrders/photos";

interface DeliveryOrderProofUploaderProps {
  receiptPhotoUrl?: string;
  receiptPhotoUrls?: string[];
  onPhotoChange: (url: string) => void;
  onPhotosChange?: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  hasError?: boolean;
  showToast?: (message: string, type: "success" | "error" | "warning") => void;
}

export function DeliveryOrderProofUploader({
  receiptPhotoUrl,
  receiptPhotoUrls,
  onPhotoChange,
  onPhotosChange,
  onUploadingChange,
  disabled = false,
  required = false,
  hasError = false,
  showToast
}: DeliveryOrderProofUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Parse current list of photos from props
  const photos = useMemo(() => {
    if (receiptPhotoUrls && receiptPhotoUrls.length > 0) return receiptPhotoUrls;
    return parseReceiptPhotos(receiptPhotoUrl);
  }, [receiptPhotoUrl, receiptPhotoUrls]);

  const updatePhotos = useCallback(
    (nextPhotos: string[]) => {
      const serialized = serializeReceiptPhotos(nextPhotos);
      onPhotoChange(serialized);
      onPhotosChange?.(nextPhotos);
    },
    [onPhotoChange, onPhotosChange]
  );

  // Stop camera stream safely
  const stopCameraStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      stopCameraStream();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [stopCameraStream, capturedPreviewUrl]);

  // Start live webcam / mobile camera stream in modal
  const startCameraStream = useCallback(async (facing: "environment" | "user") => {
    stopCameraStream();
    setCameraError(null);
    setCapturedBlob(null);
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Kamera in-browser tidak didukung pada perangkat/browser ini.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Tidak dapat mengakses kamera perangkat.";
      setCameraError(
        errorMsg.includes("Permission") || errorMsg.includes("disallowed")
          ? "Izin akses kamera ditolak oleh browser. Anda dapat menggunakan tombol 'Kamera HP (Native)' di bawah."
          : `Gagal membuka kamera: ${errorMsg}`
      );
    }
  }, [stopCameraStream, capturedPreviewUrl]);

  // Event handlers to open viewfinder and toggle lens
  const handleOpenViewfinder = () => {
    setIsCameraModalOpen(true);
    startCameraStream(cameraFacingMode);
  };

  const handleToggleFacingMode = () => {
    const nextMode = cameraFacingMode === "environment" ? "user" : "environment";
    setCameraFacingMode(nextMode);
    startCameraStream(nextMode);
  };

  // Smart camera handler:
  // - On mobile devices: launches native camera capture directly
  // - On desktop/laptop: opens in-browser live webcam viewfinder modal directly
  const handleSmartCameraClick = () => {
    const isMobile =
      typeof window !== "undefined" &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth < 768));

    if (isMobile) {
      nativeCameraInputRef.current?.click();
    } else {
      handleOpenViewfinder();
    }
  };

  // Process and upload multiple files sequentially with compression
  const processAndUploadFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;
    setIsUploading(true);
    onUploadingChange?.(true);

    const uploadedUrls: string[] = [];
    const total = rawFiles.length;

    try {
      for (let i = 0; i < total; i++) {
        const rawFile = rawFiles[i];
        setUploadStatusText(
          total > 1
            ? `Mengunggah foto (${i + 1}/${total}): ${rawFile.name}...`
            : "Mengoptimalkan foto bukti..."
        );

        // 1. Client-side compression
        const optimizedFile = await compressImage(rawFile, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.82
        });

        // 2. Prepare FormData
        const formData = new FormData();
        formData.append("file", optimizedFile);

        // 3. Send to API
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        const data = await res.json();

        if (data.success && data.data?.url) {
          uploadedUrls.push(data.data.url);
        } else {
          console.error("Gagal mengunggah foto:", data.message);
        }
      }

      if (uploadedUrls.length > 0) {
        const nextPhotos = [...photos, ...uploadedUrls];
        updatePhotos(nextPhotos);
        showToast?.(
          uploadedUrls.length === 1
            ? "Foto bukti pengiriman berhasil ditambahkan."
            : `${uploadedUrls.length} foto bukti pengiriman berhasil ditambahkan.`,
          "success"
        );
      } else {
        showToast?.("Gagal mengunggah foto bukti.", "error");
      }
    } catch {
      showToast?.("Terjadi kesalahan koneksi saat mengunggah foto bukti.", "error");
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
      setUploadStatusText("");
      // Reset input values so same file can be re-selected if needed
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  // Handler for standard file inputs (Multi-select supported)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processAndUploadFiles(files);
  };

  // Handler for snapping photo in live webcam modal
  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        const previewUrl = URL.createObjectURL(blob);
        setCapturedPreviewUrl(previewUrl);
        stopCameraStream();
      },
      "image/jpeg",
      0.9
    );
  };

  // Confirm photo from modal
  const handleConfirmCapturedPhoto = async () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `resi-kamera-${Date.now()}.jpg`, {
      type: "image/jpeg"
    });
    setIsCameraModalOpen(false);
    stopCameraStream();
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    await processAndUploadFiles([file]);
  };

  // Retake photo in modal
  const handleRetakeSnapshot = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    startCameraStream(cameraFacingMode);
  };

  const handleCloseCameraModal = () => {
    setIsCameraModalOpen(false);
    stopCameraStream();
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    setCameraError(null);
  };

  // Remove specific photo by index
  const handleRemovePhotoAt = (index: number) => {
    const nextPhotos = photos.filter((_, i) => i !== index);
    updatePhotos(nextPhotos);
    showToast?.("Foto bukti pengiriman dihapus.", "warning");
  };

  return (
    <div className="space-y-3">
      {/* Hidden file inputs for direct trigger */}
      {/* 1. Native mobile camera input */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled || isUploading}
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Ambil Foto Kamera Native"
      />

      {/* 2. File / Gallery picker input (Multiple enabled) */}
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        disabled={disabled || isUploading}
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Upload File atau Galeri"
      />

      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
          Foto Resi / Bukti Pengiriman {required ? <span className="text-rose-600 font-bold ml-0.5">* Wajib</span> : ""} {photos.length > 0 ? `(${photos.length} Foto)` : ""}
        </label>
        {photos.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Tersimpan {photos.length} foto</span>
          </span>
        )}
      </div>

      {/* Action Buttons (Always accessible to add photos anytime) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tombol Ambil Foto Kamera */}
        <button
          type="button"
          onClick={handleSmartCameraClick}
          disabled={disabled || isUploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs"
          title="Buka kamera perangkat untuk mengambil foto resi atau surat jalan"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Foto Kamera</span>
        </button>

        {/* Tombol Unggah File / Galeri (Multi) */}
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 transition-colors shadow-2xs"
          title="Pilih satu atau beberapa foto dari galeri/penyimpanan perangkat"
        >
          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Pilih dari File (Multi)</span>
        </button>
      </div>

      {/* Uploading Status Banner */}
      {isUploading && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 animate-pulse">
          <svg className="w-4 h-4 animate-spin text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{uploadStatusText || "Memproses foto..."}</span>
        </div>
      )}

      {/* Photo Gallery Grid */}
      {photos.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {photos.map((photoUrl, idx) => (
              <div
                key={`${photoUrl}-${idx}`}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-2 shadow-2xs hover:border-slate-300 transition-all overflow-hidden"
              >
                {/* Thumbnail Image Container */}
                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-100 border border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={`Foto Bukti #${idx + 1}`}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900/75 text-white backdrop-blur-xs">
                    Foto #{idx + 1}
                  </span>
                </div>

                {/* Card Action Bar */}
                <div className="mt-2 flex items-center justify-between text-[11px] pt-0.5 border-t border-slate-100">
                  <a
                    href={photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    title="Buka foto ukuran penuh di tab baru"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Lihat Penuh
                  </a>

                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhotoAt(idx)}
                      className="inline-flex items-center gap-0.5 font-medium text-rose-600 hover:text-rose-700 hover:underline"
                      title={`Hapus Foto #${idx + 1}`}
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Quick Add Card Slot */}
            {!disabled && (
              <button
                type="button"
                onClick={handleSmartCameraClick}
                disabled={isUploading}
                className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-2 text-center text-slate-500 hover:border-emerald-500 hover:bg-emerald-50/30 hover:text-emerald-700 transition-all cursor-pointer"
                title="Ambil foto tambahan dengan kamera"
              >
                <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[11px] font-semibold">+ Tambah Foto</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`p-3 rounded-lg border text-xs transition-colors ${
            hasError
              ? "bg-rose-50/80 border-rose-300 text-rose-800"
              : required
              ? "bg-amber-50/50 border-amber-200 text-amber-800"
              : "bg-slate-50 border-slate-200 text-slate-500"
          }`}
        >
          <div className="flex items-center gap-2">
            {hasError ? (
              <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Wajib:</span>
              </span>
            ) : required ? (
              <span className="font-semibold text-amber-700">Perhatian:</span>
            ) : null}
            <span>
              {hasError
                ? "Foto bukti fisik (resi / serah terima barang) wajib dilampirkan sebelum memproses pengiriman. Gunakan kamera langsung atau upload dari file."
                : required
                ? "Belum ada foto bukti pengiriman. Wajib dilampirkan minimal 1 foto sebelum barang dapat dikirim."
                : "Belum ada foto bukti pengiriman. Gunakan kamera langsung atau upload dari file."}
            </span>
          </div>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="text-sm font-bold text-slate-800">Kamera Bukti Pengiriman</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseCameraModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Tutup kamera"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Video or Snapshot Preview Container */}
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center">
              {cameraError ? (
                <div className="p-4 text-center space-y-3">
                  <p className="text-xs text-rose-300">{cameraError}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleCloseCameraModal();
                        galleryInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Pilih dari File
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleCloseCameraModal();
                        nativeCameraInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Kamera HP (Native)
                    </button>
                  </div>
                </div>
              ) : capturedPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedPreviewUrl}
                  alt="Hasil Bidikan"
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Modal Controls */}
            <div className="flex items-center justify-between pt-1">
              {!capturedBlob ? (
                <>
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Ganti Lensa
                  </button>

                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    disabled={!!cameraError}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-md disabled:opacity-50"
                  >
                    <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                    Jepret Foto
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseCameraModal}
                    className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleRetakeSnapshot}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Foto Ulang
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCapturedPhoto}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Gunakan Foto Ini
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
