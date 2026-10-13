import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Select } from "@/components/ui/Select";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listCctvDetectionsPaginated, getCctvStats } from "@/lib/cctv/store";
import { CctvStatsCards } from "@/components/cctv/CctvStatsCards";
import { CctvDetectionsTable } from "@/components/cctv/CctvDetectionsTable";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/cctv-monitoring?${next.toString()}`;
}

function activeFilterLabels(params: Record<string, string | string[] | undefined>) {
  return [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "eventType") && valueOf(params, "eventType") !== "all"
      ? `Event: ${valueOf(params, "eventType")}`
      : null,
    valueOf(params, "matchStatus") && valueOf(params, "matchStatus") !== "all"
      ? `Status: ${valueOf(params, "matchStatus")}`
      : null,
    valueOf(params, "search") ? `Kata Kunci: ${valueOf(params, "search")}` : null,
  ].filter(Boolean) as string[];
}

export default async function CctvMonitoringPage({ searchParams }: Props) {
  const role = await getCurrentRole();
  if (!can(role, "audit.view")) redirect("/no-access");

  const params = (await searchParams) || {};
  const page = Number(valueOf(params, "page") || "1");
  const eventType = valueOf(params, "eventType") || "all";
  const matchStatus = valueOf(params, "matchStatus") || "all";
  const search = valueOf(params, "search") || "";
  const from = valueOf(params, "from") || "";
  const to = valueOf(params, "to") || "";

  const [detectionsResult, stats] = await Promise.all([
    listCctvDetectionsPaginated({
      page,
      pageSize: 20,
      search,
      eventType,
      matchStatus,
      from,
      to,
    }),
    getCctvStats(),
  ]);

  const activeFilters = activeFilterLabels(params);

  return (
    <AppShell>
      {/* Header Halaman */}
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">
            Sistem & Monitoring
          </p>
          <h2 className="aj-page-title text-3xl font-bold">Monitoring CCTV</h2>
          <p className="mt-2 text-sm text-slate-600">
            Pemantauan real-time rekaman meja packing, bukti foto resi, kesehatan kamera, dan deteksi anomali.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="http://31.97.51.194:8000"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Buka Web CCTV SLM</span>
            <span className="text-slate-400">↗</span>
          </a>
        </div>
      </div>

      {/* Kartu Ringkasan & KPI */}
      <CctvStatsCards stats={stats} />

      {/* Filter Panel */}
      <ResponsiveFilterPanel
        title="Filter Log CCTV"
        resetHref="/cctv-monitoring"
        activeFilters={activeFilters}
        emptyText="Menampilkan semua data pendeteksian CCTV."
        className="mb-5"
        formClassName="grid gap-3 sm:grid-cols-2 md:grid-cols-5"
        actionsClassName="sm:col-span-2 md:col-span-5"
      >
        <label className="text-sm font-medium text-slate-700">
          Dari Tanggal
          <Input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Sampai Tanggal
          <Input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Tipe Kejadian
          <Select name="eventType" defaultValue={eventType} className="mt-1">
            <option value="all">Semua Kejadian</option>
            <option value="packing_completed">Selesai Packing (Packing Completed)</option>
            <option value="anomaly">Anomali Jalur Meja</option>
            <option value="camera_offline">Kamera Offline</option>
            <option value="desk_empty">Meja Kosong (Desk Empty)</option>
          </Select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Pencocokan SLM
          <Select name="matchStatus" defaultValue={matchStatus} className="mt-1">
            <option value="all">Semua Status</option>
            <option value="matched">Cocok dengan Invoice ERP</option>
            <option value="unmatched">Belum Terhubung</option>
            <option value="review">Perlu Ditinjau</option>
          </Select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Cari Resi / Customer
          <Input
            name="search"
            defaultValue={search}
            placeholder="No resi, nama, kamera..."
            className="mt-1"
          />
        </label>
      </ResponsiveFilterPanel>

      {/* Tabel Utama Log Deteksi */}
      <CctvDetectionsTable items={detectionsResult.items as any} />

      {/* Navigasi Paginasi */}
      {detectionsResult.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 rounded-xl shadow-xs">
          <p className="text-xs text-slate-500">
            Menampilkan halaman <strong className="text-slate-800">{detectionsResult.page}</strong> dari{" "}
            <strong className="text-slate-800">{detectionsResult.totalPages}</strong> (Total{" "}
            {detectionsResult.total} log)
          </p>
          <div className="flex gap-2">
            {detectionsResult.page > 1 && (
              <Link
                href={pageHref(params, detectionsResult.page - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ← Sebelumnya
              </Link>
            )}
            {detectionsResult.page < detectionsResult.totalPages && (
              <Link
                href={pageHref(params, detectionsResult.page + 1)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Selanjutnya →
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
