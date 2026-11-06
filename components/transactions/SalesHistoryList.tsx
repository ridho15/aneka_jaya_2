"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { Sale } from "@/lib/types/sales";
import { saleDayKey } from "@/lib/sales/dayKey";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { parseReceiptPhotos } from "@/lib/deliveryOrders/photos";
import { approvalLabel } from "@/lib/sales/approvalLabel";

type Props = {
  sales: Sale[];
  canManage: boolean;
  canViewTransactionNumber: boolean;
  productNames?: Record<string, string>;
  /** Jumlah nota & total rupiah per hari di pembatas tanggal (Super Admin saja). */
  showDayTotals?: boolean;
  /** Qty per barang (kode huruf kecil) per nota yang terjual melebihi stok. */
  stockShortage?: Record<string, Record<string, number>>;
  /** Total per hari dari seluruh nota yang cocok dengan filter (bukan hanya halaman ini). */
  dayTotals?: Record<string, { count: number; total: number }>;
};

/** "TF BCA - Hery", "Cash + TF BCA" untuk Split, atau nama metode saja. */
export function paymentLabel(sale: Pick<Sale, "paymentMethod" | "rekeningNameSnapshot" | "transferAccount" | "paymentSplits">) {
  if (sale.paymentMethod === "TF") {
    const rekening = sale.rekeningNameSnapshot || sale.transferAccount;
    return rekening ? `TF ${rekening}` : "TF";
  }
  if (sale.paymentMethod === "Split") {
    const tf = sale.paymentSplits?.find((part) => part.method === "TF")?.rekeningNameSnapshot || sale.rekeningNameSnapshot;
    return `Cash + TF${tf ? ` ${tf}` : ""}`;
  }
  return sale.paymentMethod;
}

/** Kunci tanggal (zona Jakarta) untuk memisahkan transaksi per hari. */

const dayLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "2-digit", month: "short", year: "numeric" });

/** Ringkasan per hari di halaman ini: jumlah nota dan total (nota batal tidak dihitung). */
function daySummaries(sales: Sale[]) {
  const map = new Map<string, { count: number; total: number }>();
  for (const sale of sales) {
    if (sale.approvalStatus === "cancelled") continue;
    const key = saleDayKey(sale);
    const current = map.get(key) ?? { count: 0, total: 0 };
    map.set(key, { count: current.count + 1, total: current.total + (Number(sale.total) || 0) });
  }
  return map;
}

/** Jumlah nota & total rupiah per hari hanya untuk Super Admin; peran lain cukup tanggal. */
function DayHeading({ dayKey, summary, showTotal }: { dayKey: string; summary?: { count: number; total: number }; showTotal: boolean }) {
  const date = new Date(`${dayKey}T00:00:00+07:00`);
  return (
    <>
      <span className="font-semibold text-slate-700">{Number.isNaN(date.getTime()) ? dayKey : dayLabel.format(date)}</span>
      {summary && showTotal && <span className="text-slate-500"> · {summary.count} nota · {rupiah(summary.total)}</span>}
    </>
  );
}

const rowLink =
  "inline-flex min-h-7 items-center rounded-md px-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50";

export function nextExpandedSaleId(
  currentId: string | null,
  selectedId: string,
) {
  return currentId === selectedId ? null : selectedId;
}

export function salesItemSubtotal(item: Sale["items"][number]) {
  return item.quantity * item.unitPrice - (item.discount || 0);
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

const shortDate = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "2-digit" });
const shortTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

/** Tanggal ringkas satu baris, mis. "09 Okt 26 15.56". */
function saleDateShort(sale: Sale) {
  const raw = sale.transactionAt || sale.saleDate;
  const date = new Date(sale.transactionAt ? raw : `${raw}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return sale.transactionAt ? `${shortDate.format(date)} ${shortTime.format(date)}` : shortDate.format(date);
}

/** Jam saja (tanggal sudah ada di judul hari), untuk kartu HP. */
function saleTimeLabel(sale: Sale) {
  if (!sale.transactionAt) return sale.saleDate;
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date(sale.transactionAt));
}

function saleDateLabel(sale: Sale) {
  return sale.transactionAt
    ? formatJakartaDateTime(sale.transactionAt)
    : sale.saleDate;
}

function Badge({
  value,
  tone = "slate",
}: {
  value: string;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>
      {value}
    </span>
  );
}

function statusTone(value?: string) {
  if (
    value === "approved" ||
    value === "synced" ||
    value === "released" ||
    value === "paid" ||
    value === "partial"
  )
    return "green";
  if (value === "draft" || value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled")
    return "red";
  return "slate";
}

export function stockReleaseBadge(sale: Sale) {
  const status = sale.stockReleaseStatus;
  if (status === "released" || status === "already_released") {
    return <Badge value="Stok Released" tone="green" />;
  }
  if (status === "pending") {
    return <Badge value="Stok Pending" tone="amber" />;
  }
  if (status === "failed") {
    return <Badge value="Stok Gagal" tone="red" />;
  }
  return <Badge value="Non-Stok" tone="slate" />;
}

export function unifiedDeliveryStatus(sale: Pick<Sale, "doStatus" | "doPackingStatus" | "doShippingStatus">): {
  label: string;
  className: string;
} {
  if (sale.doStatus === "selesai") {
    return {
      label: "Selesai",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200"
    };
  }
  if (sale.doStatus === "selesai_setengah") {
    return {
      label: "Selesai Sebagian",
      className: "bg-amber-100 text-amber-800 border-amber-200"
    };
  }
  if (sale.doPackingStatus === "sudah") {
    return {
      label: "Siap Kirim",
      className: "bg-blue-100 text-blue-800 border-blue-200"
    };
  }
  return {
    label: "Belum Diproses",
    className: "bg-slate-100 text-slate-600 border-slate-200"
  };
}

export function DeliveryStatusBadge({ status }: { status?: string }) {
  const normalized = status || "belum_selesai";
  if (normalized === "selesai") {
    return (
      <span
        data-testid="do-status-badge"
        className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 shadow-xs border border-emerald-200"
      >
        Selesai
      </span>
    );
  }
  if (normalized === "selesai_setengah") {
    return (
      <span
        data-testid="do-status-badge"
        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-xs border border-amber-200"
      >
        Selesai Sebagian
      </span>
    );
  }
  return (
    <span
      data-testid="do-status-badge"
      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-xs border border-slate-200"
    >
      Belum Diproses
    </span>
  );
}

export function DeliveryOrderBadges({ sale, wrap = false }: { sale: Sale; wrap?: boolean }) {
  const { label, className } = unifiedDeliveryStatus(sale);
  const printOfficer = (sale.printedBy || "").trim();

  return (
    <div data-testid="do-badges-container" className={wrap ? "contents" : "mb-1 flex items-center gap-1.5 flex-nowrap whitespace-nowrap"}>
      <span
        data-testid="do-status-badge"
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold border shadow-xs ${className}`}
      >
        {label}
      </span>
      {sale.doTrackingNumber && (
        <span
          data-testid="do-tracking-badge"
          title={`Nomor Resi: ${sale.doTrackingNumber}`}
          className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 border border-slate-200 shadow-2xs"
        >
          Resi: {sale.doTrackingNumber}
        </span>
      )}
      {sale.doReceiptPhotoUrl && (() => {
        const photos = parseReceiptPhotos(sale.doReceiptPhotoUrl);
        if (photos.length === 0) return null;
        return (
          <a
            href={photos[0]}
            target="_blank"
            rel="noreferrer"
            title={photos.length > 1 ? `${photos.length} foto bukti pengiriman tersimpan (klik untuk melihat foto pertama)` : "Lihat Foto Resi Pengiriman"}
            className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors shadow-2xs"
          >
            <svg className="w-3 h-3 text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{photos.length > 1 ? `Resi (${photos.length})` : "Resi"}</span>
          </a>
        );
      })()}
      {printOfficer && (
        <span
          data-testid="do-print-officer-badge"
          title={`Dicetak oleh: ${printOfficer}${sale.printedAt ? ` pada ${sale.printedAt}` : ""}`}
          className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-300 shadow-2xs"
        >
          <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>{printOfficer}</span>
        </span>
      )}
      {sale.doPackingStatus === "sudah" && (
        <span
          data-testid="do-packing-badge"
          title="Pesanan telah selesai dipacking (Surat Jalan)"
          className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs"
        >
          <svg className="w-3 h-3 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span>Dipacking</span>
        </span>
      )}
    </div>
  );
}

function ExpandButton({
  sale,
  expanded,
  onToggle,
  compact = false,
}: {
  sale: Sale;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const contentId = `sale-items-${sale.id}`;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={contentId}
      aria-label={
        compact
          ? `${expanded ? "Tutup" : "Lihat"} item transaksi ${sale.customerName}`
          : undefined
      }
      onClick={onToggle}
      className={
        compact
          ? "grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          : "flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      }
    >
      <span
        aria-hidden="true"
        className={`text-xs transition-transform ${expanded ? "rotate-180" : ""}`}
      >
        ⌄
      </span>
      {!compact &&
        (expanded ? "Tutup item" : `Lihat item (${sale.items.length})`)}
    </button>
  );
}

/** Tanda barang yang terjual melebihi stok (stok kosong tapi tetap jadi penjualan). */
function EmptyStockBadge({ shortage }: { shortage?: Record<string, number> }) {
  const count = shortage ? Object.keys(shortage).length : 0;
  if (!count) return null;
  return (
    <span title={`${count} barang terjual melebihi stok`} className="whitespace-nowrap rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-800">
      Stok kosong{count > 1 ? ` · ${count}` : ""}
    </span>
  );
}

export function SalesItemsDetail({
  sale,
  className = "",
  productNames = {},
  shortage = {},
}: {
  sale: Sale;
  className?: string;
  /** Nama barang dari Master Barang SLM per kode (huruf kecil). */
  productNames?: Record<string, string>;
  /** Qty yang melebihi stok per kode barang (huruf kecil). */
  shortage?: Record<string, number>;
}) {
  return (
    <div id={`sale-items-${sale.id}`} className={className}>
      {sale.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">
          Tidak ada item barang pada transaksi ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Harga</th>
                <th className="px-4 py-2.5 text-right">Diskon</th>
                <th className="px-4 py-2.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => {
                const manualName = item.manualProduct?.name?.trim();
                const manualSku =
                  item.manualProduct?.sku?.trim() || item.productRef;
                return (
                  <tr
                    key={`${item.productRef}-${index}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {manualName || item.productRef}
                      </p>
                      {!manualName && productNames[item.productRef.trim().toLowerCase()] && (
                        <p className="mt-0.5 text-xs text-slate-500">{productNames[item.productRef.trim().toLowerCase()]}</p>
                      )}
                      {shortage[item.productRef.trim().toLowerCase()] > 0 && (
                        <p className="mt-1 inline-flex rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-800">
                          Stok kosong: {shortage[item.productRef.trim().toLowerCase()].toLocaleString("id-ID")} {item.unitSnapshot || ""} tanpa stok
                        </p>
                      )}
                      {manualName && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          SKU: {manualSku}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {item.quantity} {item.unitSnapshot || ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {rupiah(item.unitPrice)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {rupiah(item.discount || 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {rupiah(salesItemSubtotal(item))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SalesHistoryList({
  sales,
  canManage,
  canViewTransactionNumber,
  productNames = {},
  showDayTotals = false,
  dayTotals,
  stockShortage = {},
}: Props) {
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const columnCount = canViewTransactionNumber ? 9 : 8;
  const toggle = (id: string) =>
    setExpandedSaleId((current) => nextExpandedSaleId(current, id));

  const pageTotals = daySummaries(sales);
  const perDay = { get: (key: string) => dayTotals?.[key] ?? pageTotals.get(key) };
  const startsNewDay = (index: number) => index === 0 || saleDayKey(sales[index]) !== saleDayKey(sales[index - 1]);

  return (
    <>
      <div data-testid="sales-mobile-cards" className="space-y-3 p-4 md:hidden">
        {sales.map((sale, index) => {
          const expanded = expandedSaleId === sale.id;
          const isMj =
            sale.source === "MJ" || sale.createdByUserId === "integration:mj";
          return (
            <Fragment key={sale.id}>
            {startsNewDay(index) && (
              <p className={`text-xs ${index > 0 ? "border-t border-slate-300 pt-3" : ""}`}>
                <DayHeading dayKey={saleDayKey(sale)} summary={perDay.get(saleDayKey(sale))} showTotal={showDayTotals} />
              </p>
            )}
            <article
              key={sale.id}
              className={`rounded-lg px-3 py-2.5 shadow-sm ${isMj ? "border-2 border-amber-300 bg-amber-50/60" : "border border-slate-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <span className="truncate">{sale.customerName}</span>
                    {isMj && <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">MJ</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {saleTimeLabel(sale)} · {sale.tipeCodeSnapshot || sale.tipeId || "W"} · {paymentLabel(sale)}
                  </p>
                </div>
                <p className="shrink-0 text-right font-bold text-slate-900">{rupiah(sale.total)}</p>
              </div>
              {/* Status: hanya yang perlu perhatian; yang normal (disetujui, stok terpotong) tidak ditampilkan. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <DeliveryOrderBadges sale={sale} wrap />
                {sale.approvalStatus && sale.approvalStatus !== "approved" && (
                  <Badge value={approvalLabel(sale.approvalStatus)} tone={statusTone(sale.approvalStatus)} />
                )}
                {sale.stockReleaseStatus !== "released" && sale.stockReleaseStatus !== "already_released" && stockReleaseBadge(sale)}
                <EmptyStockBadge shortage={stockShortage[sale.id]} />
                {!sale.isPrinted && sale.source === "MJ" && <Badge value="Belum Cetak" tone="slate" />}
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-500">
                {[canViewTransactionNumber ? sale.transactionNumber || sale.id : null, sale.customerLocation, sale.createdByNameSnapshot && `oleh ${sale.createdByNameSnapshot}`].filter(Boolean).join(" · ")}
              </p>
              {expanded && <SalesItemsDetail sale={sale} className="mt-2" productNames={productNames} shortage={stockShortage[sale.id]} />}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Tutup" : "Lihat"} item transaksi ${sale.customerName}`}
                  onClick={() => toggle(sale.id)}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700"
                >
                  {expanded ? "Tutup" : `${sale.items.length} item`}
                  <span aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
                </button>
                <Link className="grid h-9 min-w-0 flex-1 place-items-center rounded-md bg-emerald-600 text-xs font-semibold text-white" href={`/penjualan/${sale.id}`}>
                  Detail
                </Link>
                <Link className="grid h-9 min-w-0 flex-1 place-items-center rounded-md border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800" href={`/print/sales/${sale.id}/continuous`}>
                  Cetak
                </Link>
                {canManage && sale.source !== "MJ" && sale.approvalStatus !== "cancelled" && (
                  <>
                    <Link className="grid h-9 min-w-0 flex-1 place-items-center rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-700" href={`/penjualan/${sale.id}/edit`}>
                      Edit
                    </Link>
                    <div className="flex-1">
                      <TransactionCancelButton
                        id={sale.id}
                        kind="sales"
                        transactionLabel={sale.transactionNumber || sale.customerName}
                        triggerLabel="Batal"
                        triggerClassName="h-9 w-full rounded-md border border-rose-300 bg-rose-50 px-2 text-xs font-bold text-rose-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
                  </>
                )}
              </div>
            </article>
            </Fragment>
          );
        })}
        {sales.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            Tidak ada penjualan sesuai filter.
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="w-10 px-2 py-2.5">
                <span className="sr-only">Item</span>
              </th>
              <th className="px-2 py-2.5">Aksi</th>
              <th className="px-2 py-2.5">Tanggal</th>
              {canViewTransactionNumber && (
                <th className="px-2 py-2.5">No Transaksi</th>
              )}
              <th className="px-2 py-2.5">Customer</th>
              <th className="px-2 py-2.5">Tipe · Bayar</th>
              <th className="px-2 py-2.5 text-right">Total</th>
              <th className="px-2 py-2.5">Status</th>
              <th className="hidden px-2 py-2.5 2xl:table-cell">Pembuat</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale, index) => {
              const expanded = expandedSaleId === sale.id;
              const isMj =
                sale.source === "MJ" ||
                sale.createdByUserId === "integration:mj";
              const editable = canManage && sale.source !== "MJ" && sale.approvalStatus !== "cancelled";
              const delivery = unifiedDeliveryStatus(sale);
              const stockProblem = sale.stockReleaseStatus === "pending" || sale.stockReleaseStatus === "failed";
              return (
                <Fragment key={sale.id}>
                  {startsNewDay(index) && (
                    <tr className="border-y border-slate-300 bg-slate-100/80">
                      <td colSpan={columnCount} className="px-3 py-1.5 text-xs">
                        <DayHeading dayKey={saleDayKey(sale)} summary={perDay.get(saleDayKey(sale))} showTotal={showDayTotals} />
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`border-b transition-colors ${isMj ? "border-amber-200/90 bg-amber-50/80 hover:bg-amber-100/70" : "border-slate-100 hover:bg-slate-50/80"}`}
                  >
                    <td className="px-2 py-2">
                      <ExpandButton
                        sale={sale}
                        expanded={expanded}
                        onToggle={() => toggle(sale.id)}
                        compact
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="grid w-[7.5rem] grid-cols-2">
                        <Link className={rowLink} href={`/penjualan/${sale.id}`}>
                          Detail
                        </Link>
                        <Link
                          className={rowLink}
                          href={`/print/sales/${sale.id}/continuous`}
                          title={sale.isPrinted ? `Cetak Nota Continuous Form · sudah dicetak${sale.printCount ? ` ${sale.printCount}x` : ""}${sale.printedAt ? ` pada ${sale.printedAt}` : ""}` : "Cetak Nota Continuous Form"}
                        >
                          Cetak{sale.isPrinted && <span className="sr-only"> (sudah dicetak)</span>}
                        </Link>
                        {editable && (
                          <Link className={rowLink} href={`/penjualan/${sale.id}/edit`}>
                            Edit
                          </Link>
                        )}
                        {editable && (
                          <TransactionCancelButton
                            id={sale.id}
                            kind="sales"
                            transactionLabel={sale.transactionNumber || sale.customerName}
                            triggerLabel="Batal"
                            triggerClassName="inline-flex min-h-7 items-center rounded-md px-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-slate-600" title={saleDateLabel(sale)}>
                      {saleDateShort(sale)}
                    </td>
                    {canViewTransactionNumber && (
                      <td className="max-w-[130px] truncate px-2 py-2 font-mono text-[11px] text-slate-500" title={sale.transactionNumber || sale.id}>
                        {sale.transactionNumber || sale.id}
                      </td>
                    )}
                    <td className="max-w-[200px] px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-slate-900" title={`${sale.customerName}${sale.customerLocation ? ` · ${sale.customerLocation}` : ""}`}>
                          {sale.customerName}
                        </span>
                        {isMj && (
                          <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">MJ</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[190px] truncate px-2 py-2 text-slate-700" title={paymentLabel(sale)}>
                      <b>{sale.tipeCodeSnapshot || sale.tipeId || "W"}</b> · {paymentLabel(sale)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {rupiah(sale.total)}
                    </td>
                    <td className="px-2 py-2">
                      {/* Disetujui adalah kondisi normal; hanya status lain yang perlu terlihat. */}
                      <div className="flex items-center gap-1.5">
                        {(sale.approvalStatus || "approved") !== "approved" && (
                          <Badge
                            value={approvalLabel(sale.approvalStatus)}
                            tone={statusTone(sale.approvalStatus)}
                          />
                        )}
                        {stockProblem && stockReleaseBadge(sale)}
                        <EmptyStockBadge shortage={stockShortage[sale.id]} />
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${delivery.className}`}>{delivery.label}</span>
                        {sale.doPackingStatus === "sudah" && sale.doStatus !== "selesai" && sale.doStatus !== "selesai_setengah" && (
                          <span className="text-xs font-semibold text-emerald-800">Dipacking</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 text-slate-600 2xl:table-cell">
                      {sale.createdByNameSnapshot || "—"}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={columnCount} className="whitespace-normal px-5 py-4">
                        <SalesItemsDetail sale={sale} productNames={productNames} shortage={stockShortage[sale.id]} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sales.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  Tidak ada penjualan sesuai filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
