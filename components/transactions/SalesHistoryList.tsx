"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Sale } from "@/lib/types/sales";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";
import { formatJakartaDateTime } from "@/lib/date/jakarta";

type Props = {
  sales: Sale[];
  canManage: boolean;
  canViewTransactionNumber: boolean;
};

export function nextExpandedSaleId(currentId: string | null, selectedId: string) {
  return currentId === selectedId ? null : selectedId;
}

export function salesItemSubtotal(item: Sale["items"][number]) {
  return item.quantity * item.unitPrice - (item.discount || 0);
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function saleDateLabel(sale: Sale) {
  return sale.transactionAt ? formatJakartaDateTime(sale.transactionAt) : sale.saleDate;
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700"
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value}</span>;
}

function statusTone(value?: string) {
  if (value === "approved" || value === "synced" || value === "released" || value === "paid" || value === "partial") return "green";
  if (value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled") return "red";
  return "slate";
}

function needsCancelAndRecreate(sale: Sale) {
  return sale.syncTarget === "erp" &&
    (sale.stockReleaseStatus === "released" || sale.erpPaymentStatus === "paid" || sale.erpPaymentStatus === "partial");
}

function ExpandButton({ sale, expanded, onToggle, compact = false }: { sale: Sale; expanded: boolean; onToggle: () => void; compact?: boolean }) {
  const contentId = `sale-items-${sale.id}`;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={contentId}
      aria-label={compact ? `${expanded ? "Tutup" : "Lihat"} item transaksi ${sale.customerName}` : undefined}
      onClick={onToggle}
      className={compact ? "grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" : "flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"}
    >
      <span aria-hidden="true" className={`text-xs transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
      {!compact && (expanded ? "Tutup item" : `Lihat item (${sale.items.length})`)}
    </button>
  );
}

function MoreActionsMenu({ sale, mobile = false }: { sale: Sale; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canEdit = sale.source !== "MJ" && sale.approvalStatus !== "cancelled" && !needsCancelAndRecreate(sale);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${mobile ? "w-full" : ""}`}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={mobile ? "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" : "inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"}>Lainnya <span aria-hidden="true">⋮</span></button>
      {open && (
        <div role="menu" className={`absolute z-30 mt-1 min-w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-xl ${mobile ? "right-0 w-full" : "right-0"}`}>
          <Link role="menuitem" className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/print/sales/${sale.id}`}>Cetak transaksi</Link>
          {canEdit && <Link role="menuitem" className="block px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50" href={`/penjualan/${sale.id}/edit`}>Edit transaksi</Link>}
          {sale.source !== "MJ" && needsCancelAndRecreate(sale) && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">Transaksi ERP harus menggunakan cancel lalu dibuat kembali.</p>}
          {sale.source !== "MJ" && <div className="border-t border-slate-100 px-4 py-2.5">
            <TransactionCancelButton id={sale.id} kind="sales" disabled={sale.approvalStatus === "cancelled"} disabledReason="Transaksi sudah dibatalkan." transactionLabel={sale.transactionNumber || sale.customerName} triggerClassName="w-full text-left text-sm font-semibold text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-400" />
          </div>}
        </div>
      )}
    </div>
  );
}

export function SalesItemsDetail({ sale, className = "" }: { sale: Sale; className?: string }) {
  return (
    <div id={`sale-items-${sale.id}`} className={className}>
      {sale.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">Tidak ada item barang pada transaksi ini.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Harga</th><th className="px-4 py-2.5 text-right">Diskon</th><th className="px-4 py-2.5 text-right">Subtotal</th></tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => {
                const manualName = item.manualProduct?.name?.trim();
                const manualSku = item.manualProduct?.sku?.trim() || item.productRef;
                return (
                  <tr key={`${item.productRef}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{manualName || item.productRef}</p>{manualName && <p className="mt-0.5 text-xs text-slate-500">SKU: {manualSku}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{item.quantity} {item.unitSnapshot || ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{rupiah(item.unitPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{rupiah(item.discount || 0)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{rupiah(salesItemSubtotal(item))}</td>
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

export function SalesHistoryList({ sales, canManage, canViewTransactionNumber }: Props) {
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const columnCount = canViewTransactionNumber ? 13 : 12;
  const toggle = (id: string) => setExpandedSaleId((current) => nextExpandedSaleId(current, id));

  return (
    <>
      <div data-testid="sales-mobile-cards" className="space-y-3 p-4 md:hidden">
        {sales.map((sale) => {
          const expanded = expandedSaleId === sale.id;
          return (
            <article key={sale.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{sale.customerName}</p><p className="mt-1 text-xs text-slate-500">{saleDateLabel(sale)} • {sale.tipeCodeSnapshot || sale.tipeId || "W"} • {sale.paymentMethod}</p></div><p className="shrink-0 text-right font-bold text-slate-900">{rupiah(sale.total)}</p></div>
              <div className="mt-3 flex flex-wrap gap-2">{sale.source === "MJ" && <Badge value={`MJ · ${sale.integrationProcessingMode || "slm_process_aj"}`} tone="blue" />}<Badge value={sale.approvalStatus || "approved"} tone={statusTone(sale.approvalStatus || "approved")} /><Badge value={`Invoice ${sale.syncStatus || "local"}`} tone={statusTone(sale.syncStatus || "local")} />{sale.syncTarget === "erp" && <Badge value={`Stok ${sale.stockReleaseStatus || "not_required"}`} tone={statusTone(sale.stockReleaseStatus || "not_required")} />}{sale.syncTarget === "erp" && <Badge value={`Payment ${sale.erpPaymentStatus || "not_required"}`} tone={statusTone(sale.erpPaymentStatus || "not_required")} />}</div>
              <dl className="mt-3 grid gap-2 text-sm text-slate-600">{canViewTransactionNumber && <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">No Transaksi</dt><dd className="mt-0.5 font-mono text-xs">{sale.transactionNumber || sale.id}</dd></div>}<div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lokasi</dt><dd className="mt-0.5">{sale.customerLocation || "—"}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pembuat</dt><dd className="mt-0.5">{sale.createdByNameSnapshot || "—"}</dd></div></dl>
              <div className="mt-4"><ExpandButton sale={sale} expanded={expanded} onToggle={() => toggle(sale.id)} /></div>
              {expanded && <SalesItemsDetail sale={sale} className="mt-3" />}
              {canManage && needsCancelAndRecreate(sale) && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Transaksi ERP harus dibatalkan lalu dibuat kembali untuk melakukan koreksi.</p>}
              <div className="mt-4 grid grid-cols-2 gap-2"><Link className="rounded-md bg-emerald-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700" href={`/penjualan/${sale.id}`}>Lihat detail</Link>{canManage ? <MoreActionsMenu sale={sale} mobile /> : <Link className="rounded-md border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/print/sales/${sale.id}`}>Cetak transaksi</Link>}</div>
            </article>
          );
        })}
        {sales.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada penjualan sesuai filter.</p>}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="w-14 px-3 py-3"><span className="sr-only">Item</span></th><th className="px-5 py-3">Tanggal</th>{canViewTransactionNumber && <th className="px-5 py-3">No Transaksi</th>}<th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Pembayaran</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3">Approval</th><th className="px-5 py-3">Invoice ERP</th><th className="px-5 py-3">Release Stok</th><th className="px-5 py-3">Payment ERP</th><th className="px-5 py-3">Pembuat</th><th className="px-5 py-3">Aksi</th></tr></thead>
          <tbody>
            {sales.map((sale) => {
              const expanded = expandedSaleId === sale.id;
              return (
                <Fragment key={sale.id}>
                  <tr className="border-b border-slate-100"><td className="px-3 py-4"><ExpandButton sale={sale} expanded={expanded} onToggle={() => toggle(sale.id)} compact /></td><td className="px-5 py-4 text-slate-600">{saleDateLabel(sale)}</td>{canViewTransactionNumber && <td className="px-5 py-4 font-mono text-xs text-slate-700">{sale.transactionNumber || sale.id}</td>}<td className="px-5 py-4"><b>{sale.customerName}</b><p className="mt-0.5 text-xs text-slate-500">{sale.customerLocation || "—"}</p></td><td className="px-5 py-4 font-semibold">{sale.tipeCodeSnapshot || sale.tipeId || "W"}</td><td className="px-5 py-4">{sale.paymentMethod}</td><td className="px-5 py-4 text-right font-semibold">{rupiah(sale.total)}</td><td className="px-5 py-4"><Badge value={sale.approvalStatus || "approved"} tone={statusTone(sale.approvalStatus || "approved")} /></td><td className="px-5 py-4"><Badge value={sale.syncStatus || "local"} tone={statusTone(sale.syncStatus || "local")} /></td><td className="px-5 py-4">{sale.syncTarget === "erp" ? <Badge value={sale.stockReleaseStatus || "not_required"} tone={statusTone(sale.stockReleaseStatus || "not_required")} /> : "—"}</td><td className="px-5 py-4">{sale.syncTarget === "erp" ? <Badge value={sale.erpPaymentStatus || "not_required"} tone={statusTone(sale.erpPaymentStatus || "not_required")} /> : "—"}</td><td className="px-5 py-4 text-slate-600">{sale.createdByNameSnapshot || "—"}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><Link className="whitespace-nowrap rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" href={`/penjualan/${sale.id}`}>Detail</Link>{canManage ? <MoreActionsMenu sale={sale} /> : <Link className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/print/sales/${sale.id}`}>Cetak</Link>}</div></td></tr>
                  {expanded && <tr className="border-b border-slate-200 bg-slate-50/60"><td colSpan={columnCount} className="px-5 py-4"><SalesItemsDetail sale={sale} /></td></tr>}
                </Fragment>
              );
            })}
            {sales.length === 0 && <tr><td colSpan={columnCount} className="px-5 py-10 text-center text-slate-500">Tidak ada penjualan sesuai filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
