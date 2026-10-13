import Link from "next/link";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { CctvImageModal } from "@/components/cctv/CctvImageModal";
import type { CctvSystemStatusResponse } from "@/lib/cctv/client";

export interface CctvDashboardSummaryData {
  today: {
    totalPacked: number;
    totalDetections: number;
    totalAnomalies: number;
  };
  recentPacked: Array<{
    id: string;
    invoiceNumber?: string | null;
    customerName?: string | null;
    cameraName?: string | null;
    screenshotPhotoUrl?: string | null;
    evidenceUrl?: string | null;
    createdAt: Date | string;
    packingCompletedAt?: Date | string | null;
    salesRecord?: {
      id: string;
      transactionNumber?: string | null;
      customerName: string;
      total: any;
    } | null;
  }>;
  liveSystem?: CctvSystemStatusResponse | {
    status?: string;
    cameras?: Array<{ id?: number | string; name: string; status: string; fps?: number }>;
  } | null;
}

export function CctvDashboardWidget({
  summary,
}: {
  summary: CctvDashboardSummaryData;
}) {
  const isCctvOnline = summary?.liveSystem?.status === "online" || Boolean(summary?.liveSystem?.cameras?.length);
  const totalPacked = summary?.today?.totalPacked ?? 0;
  const totalDetections = summary?.today?.totalDetections ?? 0;
  const totalAnomalies = summary?.today?.totalAnomalies ?? 0;
  const recentPacked = summary?.recentPacked ?? [];

  return (
    <section className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 mt-6">
      {/* Header Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Pengawasan Meja Packing CCTV
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Hari Ini
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring AI Vision verifikasi paket fisik dan aktivitas meja packing gudang
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/cctv-monitoring"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
          >
            <span>Live Monitor</span>
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/reports/cctv"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
          >
            <span>Laporan CCTV</span>
            <svg className="w-3.5 h-3.5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Grid 4 Kartu KPI Ringkasan */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70 transition hover:bg-slate-50">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Selesai Packing
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-700 sm:text-3xl">
            {totalPacked}
          </p>
          <p className="text-[11px] text-emerald-600 mt-1 font-semibold flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span>Paket terverifikasi</span>
          </p>
        </div>

        <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70 transition hover:bg-slate-50">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Deteksi Meja
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
            {totalDetections}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Pemindaian AI Vision
          </p>
        </div>

        <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70 transition hover:bg-slate-50">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Anomali / Review
          </p>
          <p className={`mt-1 text-2xl font-black sm:text-3xl ${totalAnomalies > 0 ? "text-rose-600" : "text-slate-900"}`}>
            {totalAnomalies}
          </p>
          <p className={`text-[11px] mt-1 font-semibold ${totalAnomalies > 0 ? "text-rose-600" : "text-slate-400"}`}>
            {totalAnomalies > 0 ? "Perlu ditinjau kasir/gudang" : "Nihil anomali"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70 transition hover:bg-slate-50">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Kamera AI Vision
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isCctvOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <p className="text-sm font-bold text-slate-800">
              {isCctvOnline ? "Online" : "Standby"}
            </p>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary.liveSystem?.cameras?.length ? `${summary.liveSystem.cameras.length} kamera aktif` : "VPS Meja Packing"}
          </p>
        </div>
      </div>

      {/* Feed 5 Paket Terakhir */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Paket Terbaru Selesai Packing (Real-Time)
          </h4>
          <span className="text-[11px] text-slate-400 font-medium">
            5 transaksi terakhir
          </span>
        </div>

        {recentPacked.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {recentPacked.map((item) => {
              const photo = item.screenshotPhotoUrl || item.evidenceUrl;
              const sale = item.salesRecord;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 flex flex-col justify-between hover:bg-slate-100/70 transition-colors shadow-2xs"
                >
                  <div className="flex items-start gap-2.5">
                    {photo ? (
                      <CctvImageModal
                        imageUrl={photo}
                        title={`Paket: #${item.invoiceNumber || "CCTV"}`}
                        subtitle={`${item.cameraName || "Meja Packing"} • ${formatJakartaDateTime(item.createdAt)}`}
                        trigger={
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-200 shadow-2xs cursor-pointer group relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo}
                              alt="Bukti Foto"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                              </svg>
                            </div>
                          </div>
                        }
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-slate-300">
                        <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {sale ? (
                        <Link
                          href={`/penjualan/${sale.id}`}
                          className="block truncate font-mono text-xs font-bold text-emerald-700 hover:underline"
                        >
                          {sale.transactionNumber || item.invoiceNumber || sale.id}
                        </Link>
                      ) : (
                        <p className="truncate font-mono text-xs font-bold text-slate-800">
                          {item.invoiceNumber || "—"}
                        </p>
                      )}
                      <p className="truncate text-[11px] font-medium text-slate-600 mt-0.5">
                        {sale?.customerName || item.customerName || "Customer Umum"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate max-w-[90px] font-medium" title={item.cameraName || "Meja Packing"}>
                      {item.cameraName || "Meja 1"}
                    </span>
                    <span className="font-mono text-slate-500">
                      {item.packingCompletedAt
                        ? formatJakartaDateTime(item.packingCompletedAt).slice(-8)
                        : formatJakartaDateTime(item.createdAt).slice(-8)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="font-medium text-slate-500">Belum ada paket yang dipacking hari ini.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Kamera CCTV standby memantau meja packing gudang.</p>
          </div>
        )}
      </div>
    </section>
  );
}
