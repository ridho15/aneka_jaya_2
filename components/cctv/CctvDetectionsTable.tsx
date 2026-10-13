import Link from "next/link";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { CctvImageModal } from "./CctvImageModal";

interface DetectionItem {
  id: string;
  cctvLabelId?: number | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  sourceLabel?: string | null;
  cameraName?: string | null;
  eventType: string;
  severity: string;
  packingStatus: string;
  matchStatus: string;
  firstSeenAt?: Date | null;
  packingCompletedAt?: Date | null;
  evidenceUrl?: string | null;
  screenshotPhotoUrl?: string | null;
  notes?: string | null;
  salesRecord?: {
    id: string;
    transactionNumber?: string | null;
    customerName: string;
    total: number;
    doPackingStatus: string;
  } | null;
}

export function CctvDetectionsTable({ items }: { items: DetectionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-200/80">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="mt-3 text-base font-bold text-slate-800 tracking-tight">
          Belum Ada Data Pendeteksian CCTV
        </h3>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Data akan otomatis masuk saat petugas membungkus paket di meja packing
          atau ketika ada event yang dikirimkan oleh sistem CCTV SLM.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3.5">Bukti Foto</th>
              <th className="px-4 py-3.5">Invoice & Customer</th>
              <th className="px-4 py-3.5">Kamera / Meja</th>
              <th className="px-4 py-3.5">Platform / Toko</th>
              <th className="px-4 py-3.5">Waktu Packing</th>
              <th className="px-4 py-3.5">Status Pencocokan</th>
              <th className="px-4 py-3.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const photo = item.screenshotPhotoUrl || item.evidenceUrl;
              const isMatched = item.matchStatus === "matched" && Boolean(item.salesRecord);

              return (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Bukti Foto */}
                  <td className="px-4 py-3 shrink-0">
                    {photo ? (
                      <CctvImageModal
                        imageUrl={photo}
                        title={`Bukti Packing CCTV: #${item.invoiceNumber || item.customerName || "Paket"}`}
                        subtitle={`${item.cameraName || "Meja Packing"} • ${item.sourceLabel || "Resi"}`}
                        trigger={
                          <div className="group relative h-12 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-xs cursor-pointer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo}
                              alt="Thumbnail"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                              </svg>
                            </div>
                          </div>
                        }
                      />
                    ) : (
                      <div className="flex h-12 w-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-400">
                        No Photo
                      </div>
                    )}
                  </td>

                  {/* Invoice & Customer */}
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-slate-900">
                      {item.invoiceNumber ? `#${item.invoiceNumber}` : "Tanpa No Resi"}
                    </p>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {item.customerName || "Customer Tidak Terdeteksi"}
                    </p>
                    {item.cctvLabelId && (
                      <span className="mt-1 inline-block text-[10px] text-slate-400 font-mono">
                        Label ID: {item.cctvLabelId}
                      </span>
                    )}
                  </td>

                  {/* Kamera / Meja */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {item.cameraName || "Meja Packing"}
                    </span>
                    {item.notes && (
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1 max-w-[180px]">
                        {item.notes}
                      </p>
                    )}
                  </td>

                  {/* Platform / Toko */}
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {item.sourceLabel || "Manual"}
                    </span>
                  </td>

                  {/* Waktu Packing */}
                  <td className="px-4 py-3 text-xs">
                    {item.packingCompletedAt ? (
                      <div>
                        <p className="font-semibold text-slate-800">
                          {formatJakartaDateTime(item.packingCompletedAt)}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-medium">Selesai Dibungkus</p>
                      </div>
                    ) : item.firstSeenAt ? (
                      <div>
                        <p className="text-slate-600">
                          {formatJakartaDateTime(item.firstSeenAt)}
                        </p>
                        <p className="text-[10px] text-amber-600 font-medium">Pertama Terdeteksi</p>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  {/* Status Pencocokan */}
                  <td className="px-4 py-3">
                    {isMatched ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        SLM: Cocok
                      </span>
                    ) : item.eventType === "anomaly" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Anomali
                      </span>
                    ) : item.eventType === "camera_offline" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Offline
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 border border-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Belum Terhubung
                      </span>
                    )}
                  </td>

                  {/* Aksi */}
                  <td className="px-4 py-3 text-right">
                    {item.salesRecord ? (
                      <Link
                        href={`/penjualan/${item.salesRecord.id}`}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition-colors inline-block"
                      >
                        Lihat Penjualan
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">Tidak Terkait</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
