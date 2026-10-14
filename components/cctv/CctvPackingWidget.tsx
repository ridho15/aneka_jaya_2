import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { CctvImageModal } from "./CctvImageModal";

export interface CctvDetectionData {
  id?: string;
  cctvLabelId?: number | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  cameraName?: string | null;
  packingStatus?: string | null;
  packingCompletedAt?: Date | string | null;
  firstSeenAt?: Date | string | null;
  evidenceUrl?: string | null;
  screenshotPhotoUrl?: string | null;
  sourceLabel?: string | null;
}

export function CctvPackingWidget({
  detection,
  title = "Verifikasi Meja Packing CCTV",
  subtitle = "Hasil deteksi otomatis AI Vision dari kamera pengawas gudang",
}: {
  detection?: CctvDetectionData | null;
  fallbackReceiptPhoto?: string | null;
  title?: string;
  subtitle?: string;
}) {
  const photo = detection?.screenshotPhotoUrl || detection?.evidenceUrl || null;
  const isDetected = Boolean(
    detection &&
      (detection.id ||
        detection.cctvLabelId ||
        detection.evidenceUrl ||
        detection.screenshotPhotoUrl ||
        detection.cameraName)
  );
  const isPacked =
    detection?.packingStatus === "completed" || Boolean(detection?.packingCompletedAt);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {title}
            </h3>
            <p className="text-xs text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDetected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Terdeteksi CCTV: Ya
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Terdeteksi CCTV: Tidak
            </span>
          )}
          {isPacked && (
            <span className="hidden sm:inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
              Packing Selesai
            </span>
          )}
        </div>
      </div>

      {isDetected ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Kolom 1 & 2: Informasi Detail */}
          <div className="md:col-span-2 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Kamera & Meja
              </p>
              <p className="mt-1 font-bold text-slate-800 text-sm">
                {detection?.cameraName || "Meja Packing Utama"}
              </p>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {detection?.sourceLabel ? `Platform: ${detection.sourceLabel}` : "Area Gudang Aneka Jaya"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Waktu Terdeteksi / Selesai
              </p>
              <p className="mt-1 font-bold text-slate-800 text-sm">
                {detection?.packingCompletedAt
                  ? formatJakartaDateTime(new Date(detection.packingCompletedAt))
                  : detection?.firstSeenAt
                    ? formatJakartaDateTime(new Date(detection.firstSeenAt))
                    : "Terekam Otomatis"}
              </p>
              <p className="text-emerald-600 font-semibold text-[11px] mt-0.5 flex items-center gap-1">
                {isPacked ? (
                  <>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Selesai Dipacking</span>
                  </>
                ) : (
                  <span>Sedang Diproses</span>
                )}
              </p>
            </div>

            {detection?.customerName && (
              <div className="col-span-2 rounded-xl bg-slate-50 p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Teks Resi / Invoice Terbaca (OCR AI)
                  </p>
                  <p className="font-medium text-slate-800 mt-0.5">
                    &ldquo;{detection.customerName}&rdquo;
                  </p>
                </div>
                {detection.cctvLabelId && (
                  <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                    Label #{detection.cctvLabelId}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Kolom 3: Thumbnail Bukti Foto Paket */}
          <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
            {photo ? (
              <div className="text-center w-full">
                <CctvImageModal
                  imageUrl={photo}
                  title={`Bukti Packing CCTV: #${detection?.invoiceNumber || "Paket"}`}
                  subtitle={`${detection?.cameraName || "Meja Packing"} • Terdeteksi AI Vision`}
                  trigger={
                    <div className="group relative mx-auto h-28 w-full max-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xs transition-all hover:shadow-md cursor-pointer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt="Foto Bukti Packing"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                        <span>Perbesar Foto</span>
                      </div>
                    </div>
                  }
                />
                <p className="mt-2 text-[11px] text-slate-500 font-medium">
                  Klik foto untuk melihat resolusi penuh
                </p>
              </div>
            ) : (
              <div className="flex h-28 w-full max-w-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="mt-1.5 text-xs text-slate-400 font-medium">
                  Foto paket belum tersinkron
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-slate-50/70 p-4 border border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400 border border-slate-200/60 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Belum Terdeteksi CCTV Meja Packing</p>
              <p className="text-slate-500">Paket ini belum terpantau melewati kamera meja packing atau sedang dalam antrian pengemasan fisik.</p>
            </div>
          </div>
          <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
            Status: Menunggu Sinyal CCTV
          </span>
        </div>
      )}
    </div>
  );
}
