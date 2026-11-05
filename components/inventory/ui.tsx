import Link from "next/link";
import type { ReactNode } from "react";

export const MOVEMENT_LABEL: Record<string, string> = {
  INITIAL: "Stok Awal",
  PURCHASE_RECEIPT: "Barang Masuk",
  TRANSFER_OUT: "Transfer Keluar",
  TRANSFER_IN: "Transfer Masuk",
  OPNAME: "Stock Opname",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  SALE_OUT: "Penjualan",
  SALE_REVERSAL: "Batal Penjualan",
  SALE_RETURN: "Retur Penjualan"
};

export function fmtQty(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function fmtDate(value: string | Date) {
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function InventoryHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Inventory Gudang & Toko</p>
        <h2 className="aj-page-title text-3xl font-bold">{title}</h2>
        {description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pager({ basePath, params, page, totalPages }: { basePath: string; params: Record<string, string | undefined>; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      {page > 1 && <Link className="rounded border px-3 py-1" href={href(page - 1)}>‹ Sebelumnya</Link>}
      <span className="text-slate-500">Hal {page} / {totalPages}</span>
      {page < totalPages && <Link className="rounded border px-3 py-1" href={href(page + 1)}>Berikutnya ›</Link>}
    </div>
  );
}

export const filterInput = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
