export interface CctvStatsData {
  today: {
    totalDetections: number;
    totalPacked: number;
    totalAnomalies: number;
    byStore: Record<string, number>;
    byCamera: Record<string, number>;
  };
  liveSystem?: {
    status: string;
    cameras: Array<{
      id: number | string;
      name: string;
      status: "online" | "offline";
    }>;
  } | null;
}

export function CctvStatsCards({ stats }: { stats: CctvStatsData }) {
  const onlineCameras =
    stats.liveSystem?.cameras?.filter((c) => c.status === "online").length ??
    Object.keys(stats.today.byCamera).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 mb-6">
      {/* Kartu 1: Total Selesai Packing */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Selesai Packing
          </p>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
          {stats.today.totalPacked}
        </p>
        <p className="mt-1 text-xs text-emerald-800 font-medium">
          Paket terbungkus hari ini
        </p>
      </div>

      {/* Kartu 2: Total Scan & Deteksi */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Total Deteksi CCTV
          </p>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </span>
        </div>
        <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
          {stats.today.totalDetections}
        </p>
        <p className="mt-1 text-xs text-blue-800 font-medium">
          Resi/label terbaca kamera
        </p>
      </div>

      {/* Kartu 3: Anomali & Insiden */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Anomali Meja
          </p>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
        </div>
        <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
          {stats.today.totalAnomalies}
        </p>
        <p className="mt-1 text-xs text-amber-800 font-medium">
          {stats.today.totalAnomalies > 0
            ? "Perlu perhatian pengawas"
            : "Semua meja packing tertib"}
        </p>
      </div>

      {/* Kartu 4: Kamera Aktif */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Kamera Meja Aktif
          </p>
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
        </div>
        <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
          {onlineCameras} <span className="text-sm font-normal text-slate-400">meja</span>
        </p>
        <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5 font-medium">
          <span className={`h-1.5 w-1.5 rounded-full ${stats.liveSystem?.status === "healthy" || onlineCameras > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          <span>{stats.liveSystem?.status === "healthy" ? "Sistem CCTV Terhubung" : "Standby Meja Packing"}</span>
        </p>
      </div>
    </div>
  );
}
