import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import {
  getCctvOutboundReport,
  getCctvAnomaliesReport,
  getCctvCamerasReport,
  listCctvCameraNames,
} from "@/lib/cctv/store";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CctvImageModal } from "@/components/cctv/CctvImageModal";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: Record<string, string | string[] | undefined>, newParams: Record<string, string | number>) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) next.set(key, value);
  }
  for (const [k, v] of Object.entries(newParams)) {
    next.set(k, String(v));
  }
  return `/reports/cctv?${next.toString()}`;
}

export default async function CctvReportsMultiTabPage({ searchParams }: Props) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view")) redirect("/no-access");

  const params = await searchParams;
  const rawTab = valueOf(params, "tab") || "outbound";
  const activeTab = rawTab === "anomalies" || rawTab === "cameras" ? rawTab : "outbound";

  const page = Math.max(1, Number(valueOf(params, "page")) || 1);
  const from = valueOf(params, "from");
  const to = valueOf(params, "to");
  const cameraName = valueOf(params, "cameraName") || "all";
  const search = valueOf(params, "search") || "";

  // Data fetching sesuai tab aktif
  const [availableCameras, outboundData, anomaliesData, camerasData] = await Promise.all([
    listCctvCameraNames().catch(() => []),
    activeTab === "outbound"
      ? getCctvOutboundReport({ page, pageSize: 20, from, to, cameraName, search }).catch(() => null)
      : null,
    activeTab === "anomalies"
      ? getCctvAnomaliesReport({ page, pageSize: 20, from, to, cameraName, search }).catch(() => null)
      : null,
    activeTab === "cameras"
      ? getCctvCamerasReport().catch(() => null)
      : null,
  ]);

  return (
    <AppShell>
      {/* Header Utama */}
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Laporan Pengawasan CCTV & Packing
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Pusat rekapitulasi komprehensif pengemasan barang, verifikasi resi fisik, audit anomali, dan kinerja meja kamera gudang.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/cctv-monitoring"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <span>Live Monitor CCTV</span>
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Tab Navigation Switcher */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <Link
          href={pageHref(params, { tab: "outbound", page: 1 })}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "outbound"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span>1. Barang Keluar & SKU</span>
        </Link>

        <Link
          href={pageHref(params, { tab: "anomalies", page: 1 })}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "anomalies"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>2. Anomali & Review Resi</span>
        </Link>

        <Link
          href={pageHref(params, { tab: "cameras", page: 1 })}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "cameras"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span>3. Kinerja Meja & Kamera</span>
        </Link>
      </div>

      {/* TAB 1: BARANG KELUAR & SKU */}
      {activeTab === "outbound" && outboundData && (
        <>
          {/* KPI Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Paket Keluar
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
                {outboundData.summary.totalOutboundPackages.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Selesai Packing Meja CCTV</span>
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Unit SKU Keluar
              </p>
              <p className="mt-2 text-2xl font-black text-blue-600 sm:text-3xl">
                {outboundData.summary.totalSkusDispatched.toLocaleString("id-ID")}{" "}
                <span className="text-sm font-normal text-slate-500">unit</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                Kuantitas produk terdistribusi
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Kamera Meja Teraktif
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900 truncate" title={outboundData.summary.topCamera}>
                {outboundData.summary.topCamera}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                Aktivitas pengepakan tertinggi
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Status Verifikasi Visual
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-700 sm:text-3xl">100%</p>
              <p className="mt-1 text-[11px] text-emerald-600 font-semibold">
                Tervalidasi AI Meja Packing
              </p>
            </div>
          </div>

          {/* Filter Panel */}
          <ResponsiveFilterPanel title="Filter Barang Keluar" resetHref="/reports/cctv?tab=outbound">
            <input type="hidden" name="tab" value="outbound" />
            <label className="text-sm font-medium text-slate-700">
              Dari Tanggal
              <Input type="date" name="from" defaultValue={from || ""} className="mt-1" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sampai Tanggal
              <Input type="date" name="to" defaultValue={to || ""} className="mt-1" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Kamera Meja Packing
              <Select name="cameraName" defaultValue={cameraName} className="mt-1">
                <option value="all">Semua Kamera Meja</option>
                {availableCameras.map((cam) => (
                  <option key={cam} value={cam}>{cam}</option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Cari No Resi / Customer / SKU
              <Input name="search" defaultValue={search} placeholder="Invoice, customer..." className="mt-1" />
            </label>
          </ResponsiveFilterPanel>

          {/* Tabel Outbound */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="px-5 py-3.5">Waktu Selesai CCTV</th>
                    <th className="px-5 py-3.5">No Invoice / Resi</th>
                    <th className="px-5 py-3.5">Customer & Pengiriman</th>
                    <th className="px-5 py-3.5">Kamera & Meja</th>
                    <th className="px-5 py-3.5 min-w-[220px]">Barang & SKU Keluar</th>
                    <th className="px-5 py-3.5 text-center">Foto Bukti</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outboundData.items.map((item) => {
                    const photo = item.screenshotPhotoUrl || item.evidenceUrl;
                    const sale = item.salesRecord;
                    const itemsCount = sale?.items?.length || 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="font-semibold text-slate-900 text-xs">
                            {item.packingCompletedAt
                              ? formatJakartaDateTime(item.packingCompletedAt)
                              : formatJakartaDateTime(item.createdAt)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            ID: {item.id.slice(-6)}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          {sale ? (
                            <Link
                              href={`/penjualan/${sale.id}`}
                              className="font-mono text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                            >
                              {sale.transactionNumber || item.invoiceNumber || sale.id}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {item.invoiceNumber || "—"}
                            </span>
                          )}
                          {item.cctvLabelId && (
                            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Label #{item.cctvLabelId}</p>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">
                            {sale?.customerName || item.customerName || "Customer Umum"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {sale?.shippingMethod || "Ekspedisi / Ambil"}
                            {sale?.customerLocation ? ` • ${sale.customerLocation}` : ""}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 text-xs">
                            {item.cameraName || "Meja Packing Utama"}
                          </p>
                          <span className="mt-1 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {item.sourceLabel || "Gudang AJ"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          {itemsCount > 0 ? (
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                              {sale!.items.map((it, idx) => (
                                <div
                                  key={it.id || idx}
                                  className="text-xs flex items-center justify-between gap-2 bg-slate-50 px-2 py-1 rounded-md border border-slate-100"
                                >
                                  <span className="font-medium text-slate-800 truncate" title={it.manualProduct ? (it.manualProduct as any).name : it.productRef}>
                                    {it.manualProduct ? (it.manualProduct as any).name : it.productRef}
                                  </span>
                                  <span className="font-bold text-slate-700 shrink-0 tabular-nums">
                                    {Number(it.quantity)} {it.unitSnapshot || "pcs"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">1 Paket Terverifikasi</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center">
                          {photo ? (
                            <CctvImageModal
                              imageUrl={photo}
                              title={`Bukti Paket: ${item.invoiceNumber || "Paket Keluar"}`}
                              subtitle={`${item.cameraName || "Kamera Meja"} • ${formatJakartaDateTime(item.createdAt)}`}
                              trigger={
                                <div className="group relative mx-auto h-14 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-2xs hover:shadow-xs transition-all cursor-pointer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={photo} alt="Foto Paket" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                  <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                    </svg>
                                  </div>
                                </div>
                              }
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Terverifikasi
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {outboundData.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                        <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <p className="font-medium text-slate-700">Tidak ada data barang keluar yang sesuai filter.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginasi Outbound */}
          {outboundData.totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">
                Halaman <strong>{page}</strong> dari <strong>{outboundData.totalPages}</strong> (Total {outboundData.total} paket)
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageHref(params, { tab: "outbound", page: page - 1 })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ← Sebelumnya
                  </Link>
                )}
                {page < outboundData.totalPages && (
                  <Link
                    href={pageHref(params, { tab: "outbound", page: page + 1 })}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Selanjutnya →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "outbound" && !outboundData && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 text-sm">
          <p className="font-bold">Gagal memuat data barang keluar</p>
          <p className="mt-1 text-xs text-rose-600">Terjadi kendala saat memuat data dari database. Silakan muat ulang halaman.</p>
        </div>
      )}

      {/* TAB 2: ANOMALI & REVIEW RESI */}
      {activeTab === "anomalies" && !anomaliesData && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 text-sm">
          <p className="font-bold">Gagal memuat data anomali CCTV</p>
          <p className="mt-1 text-xs text-rose-600">Terjadi kendala saat memuat data dari database. Silakan muat ulang halaman.</p>
        </div>
      )}

      {activeTab === "anomalies" && anomaliesData && (
        <>
          {/* Filter Panel Anomalies */}
          <ResponsiveFilterPanel title="Filter Anomali & Review" resetHref="/reports/cctv?tab=anomalies">
            <input type="hidden" name="tab" value="anomalies" />
            <label className="text-sm font-medium text-slate-700">
              Dari Tanggal
              <Input type="date" name="from" defaultValue={from || ""} className="mt-1" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sampai Tanggal
              <Input type="date" name="to" defaultValue={to || ""} className="mt-1" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Kamera Meja Packing
              <Select name="cameraName" defaultValue={cameraName} className="mt-1">
                <option value="all">Semua Kamera Meja</option>
                {availableCameras.map((cam) => (
                  <option key={cam} value={cam}>{cam}</option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Cari No Resi / Keterangan
              <Input name="search" defaultValue={search} placeholder="Nomor resi, OCR..." className="mt-1" />
            </label>
          </ResponsiveFilterPanel>

          {/* Tabel Anomalies */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="px-5 py-3.5">Waktu Kejadian</th>
                    <th className="px-5 py-3.5">Teks Resi (OCR) / Invoice</th>
                    <th className="px-5 py-3.5">Kamera & Meja</th>
                    <th className="px-5 py-3.5">Keterangan Anomali</th>
                    <th className="px-5 py-3.5 text-center">Foto Bukti</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {anomaliesData.items.map((item) => {
                    const photo = item.screenshotPhotoUrl || item.evidenceUrl;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-800 text-xs">
                          {formatJakartaDateTime(item.createdAt)}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-mono text-xs font-bold text-slate-900">
                            {item.invoiceNumber || "—"}
                          </p>
                          {item.customerName && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              Teks: &ldquo;{item.customerName}&rdquo;
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-xs font-medium text-slate-700">
                          {item.cameraName || "Meja Utama"}
                        </td>

                        <td className="px-5 py-4 text-xs">
                          <p className="font-medium text-rose-700">
                            {item.notes || "Resi tidak terdaftar di sistem ERP atau belum cocok"}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            Event: {item.eventType} • Match: {item.matchStatus}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          {photo ? (
                            <CctvImageModal
                              imageUrl={photo}
                              title={`Bukti Anomali: #${item.invoiceNumber || "Deteksi"}`}
                              subtitle={`${item.cameraName || "Kamera Meja"} • ${formatJakartaDateTime(item.createdAt)}`}
                              trigger={
                                <div className="group relative mx-auto h-12 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-2xs hover:shadow-xs transition-all cursor-pointer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={photo} alt="Bukti Anomali" className="h-full w-full object-cover" />
                                </div>
                              }
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                            Perlu Review
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {anomaliesData.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        <svg className="w-10 h-10 text-emerald-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="font-medium text-slate-700">Tidak ada catatan anomali atau resi bermasalah.</p>
                        <p className="text-xs text-slate-400 mt-0.5">Semua packing meja CCTV berjalan terverifikasi.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginasi Anomalies */}
          {anomaliesData.totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">
                Halaman <strong>{page}</strong> dari <strong>{anomaliesData.totalPages}</strong> (Total {anomaliesData.total} anomali)
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageHref(params, { tab: "anomalies", page: page - 1 })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ← Sebelumnya
                  </Link>
                )}
                {page < anomaliesData.totalPages && (
                  <Link
                    href={pageHref(params, { tab: "anomalies", page: page + 1 })}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Selanjutnya →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 3: KINERJA MEJA & KAMERA */}
      {activeTab === "cameras" && !camerasData && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 text-sm">
          <p className="font-bold">Gagal memuat data kinerja kamera CCTV</p>
          <p className="mt-1 text-xs text-rose-600">Terjadi kendala saat memuat data dari database. Silakan muat ulang halaman.</p>
        </div>
      )}

      {activeTab === "cameras" && camerasData && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {camerasData.cameras.map((cam) => (
            <div
              key={cam.name}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200/80">
                    <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    cam.isOnline ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cam.isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    {cam.isOnline ? "Aktif / Online" : "Standby"}
                  </span>
                </div>

                <h3 className="mt-3 text-base font-bold text-slate-900 tracking-tight">{cam.name}</h3>
                <p className="text-xs text-slate-500">Meja Packing Gudang Aneka Jaya</p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Hari Ini</p>
                    <p className="text-lg font-black text-emerald-700 mt-0.5">{cam.totalToday} paket</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Total Akumulasi</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{cam.totalAllTime} paket</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                Terakhir aktif: {cam.lastSeenAt ? formatJakartaDateTime(cam.lastSeenAt) : "Belum terekam"}
              </div>
            </div>
          ))}

          {camerasData.cameras.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400">
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="font-medium text-slate-600">Belum ada kamera meja packing yang terdaftar di sistem.</p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
