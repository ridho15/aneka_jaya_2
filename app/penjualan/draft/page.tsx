import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { ResponsiveFilterPanel } from "@/components/ui/ResponsiveFilterPanel";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import type { SalesRecordFilters } from "@/lib/sales/store";
import { listSalesRecordsPageForUser } from "@/lib/sales/access";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 15;

function valueOf(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: SearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/penjualan/draft?${next.toString()}`;
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DraftPenjualanPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "penjualan.create") && !can(role, "reports.view")) redirect("/");

  const canManage = can(role, "penjualan.manage");
  const params = (await searchParams) || {};
  const page = Math.max(1, Number(valueOf(params, "page") || "1"));

  const filters: SalesRecordFilters = {
    from: valueOf(params, "from") || undefined,
    to: valueOf(params, "to") || undefined,
    keyword: valueOf(params, "keyword") || undefined,
    approvalStatus: "draft",
  };

  const { data: drafts, meta } = await listSalesRecordsPageForUser(user, {
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const totalPages = meta.totalPages;
  const activeFilters = [
    valueOf(params, "from") ? `Dari ${valueOf(params, "from")}` : null,
    valueOf(params, "to") ? `Sampai ${valueOf(params, "to")}` : null,
    valueOf(params, "keyword") ? `Keyword: ${valueOf(params, "keyword")}` : null,
  ].filter(Boolean) as string[];

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-900">
              Draft Mode
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Operasional</p>
          </div>
          <h2 className="aj-page-title text-3xl font-bold">Draft Penjualan</h2>
          <p className="mt-2 text-sm text-slate-600">
            Daftar pesanan sementara yang belum difinalisasi. Stok barang di gudang Aneka Jaya{" "}
            <span className="font-semibold text-rose-700">belum dipotong</span>.
          </p>
        </div>
        {can(role, "penjualan.create") && (
          <Link
            href="/penjualan/input"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            + Input Penjualan Baru
          </Link>
        )}
      </div>

      <ResponsiveFilterPanel
        title="Filter draft"
        resetHref="/penjualan/draft"
        activeFilters={activeFilters}
        emptyText="Semua draft aktif."
        className="mb-5"
        formClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
        actionsClassName="md:col-span-3 xl:col-span-4"
      >
        <label className="text-sm font-medium text-slate-700">
          Dari tanggal
          <Input type="date" name="from" defaultValue={valueOf(params, "from") || ""} className="mt-1" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sampai tanggal
          <Input type="date" name="to" defaultValue={valueOf(params, "to") || ""} className="mt-1" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Keyword
          <Input
            name="keyword"
            defaultValue={valueOf(params, "keyword") || ""}
            placeholder="Cari nama customer / catatan..."
            className="mt-1"
          />
        </label>
      </ResponsiveFilterPanel>

      <section className="aj-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 text-sm text-slate-600">
          <div>
            Menampilkan <span className="font-semibold text-slate-900">{drafts.length}</span> dari total{" "}
            <span className="font-semibold text-slate-900">{meta.total}</span> draft pesanan.
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
            Status: Draf Belum Terpotong Stok
          </span>
        </div>

        {/* Mobile View */}
        <div className="divide-y divide-slate-100 md:hidden">
          {drafts.map((draft) => (
            <article key={draft.id} className="p-4 space-y-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900">{draft.customerName}</h3>
                  <p className="text-xs text-slate-500">
                    {draft.transactionAt ? formatJakartaDateTime(draft.transactionAt) : draft.saleDate}
                  </p>
                </div>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  Draft
                </span>
              </div>
              <div className="flex justify-between items-baseline border-t border-slate-100 pt-2">
                <span className="text-xs text-slate-500">{draft.items.length} jenis barang</span>
                <span className="text-base font-bold text-emerald-700">{rupiah(draft.total)}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/penjualan/${draft.id}/edit`}
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                >
                  Lanjutkan / Finalkan
                </Link>
                {canManage && (
                  <div className="w-24">
                    <TransactionCancelButton
                      id={draft.id}
                      kind="sales"
                      transactionLabel={`Draft ${draft.customerName}`}
                      triggerLabel="Hapus"
                      triggerClassName="w-full rounded-md border border-rose-300 bg-rose-50 px-2.5 py-2 text-center text-xs font-bold text-rose-700 hover:bg-rose-100"
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
          {drafts.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-base font-semibold text-slate-700">Tidak ada draft penjualan</p>
              <p className="mt-1 text-sm text-slate-500">Semua pesanan telah difinalisasi atau belum ada draft tersimpan.</p>
              <Link
                href="/penjualan/input"
                className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                + Buat Penjualan Sekarang
              </Link>
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Tanggal Draft</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Rincian Barang</th>
                <th className="px-5 py-3.5">Tipe</th>
                <th className="px-5 py-3.5 text-right">Total Estimasi</th>
                <th className="px-5 py-3.5">Dibuat Oleh</th>
                <th className="px-5 py-3.5 text-center w-52">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drafts.map((draft) => (
                <tr key={draft.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-4 text-slate-600 whitespace-nowrap">
                    {draft.transactionAt ? formatJakartaDateTime(draft.transactionAt) : draft.saleDate}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900">{draft.customerName}</div>
                    <div className="text-xs text-slate-500">{draft.customerLocation || "Toko"}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <span className="font-semibold">{draft.items.length} item</span>
                    <p className="text-xs text-slate-500 truncate max-w-xs" title={draft.items.map((i) => `${i.productRef} (${i.quantity})`).join(", ")}>
                      {draft.items.map((i) => i.productRef).slice(0, 3).join(", ")}
                      {draft.items.length > 3 ? "..." : ""}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {draft.tipeCodeSnapshot || draft.tipeId || "W"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                    {rupiah(draft.total)}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {draft.createdByNameSnapshot || "Kasir"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/penjualan/${draft.id}/edit`}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 whitespace-nowrap"
                      >
                        Lanjutkan / Finalkan →
                      </Link>
                      {canManage && (
                        <div className="w-20">
                          <TransactionCancelButton
                            id={draft.id}
                            kind="sales"
                            transactionLabel={`Draft ${draft.customerName}`}
                            triggerLabel="Hapus"
                            triggerClassName="w-full rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 shadow-xs cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <p className="text-base font-semibold text-slate-700">Tidak ada draft penjualan tersimpan</p>
                    <p className="mt-1 text-sm text-slate-500">Gunakan tombol &quot;Simpan Draft&quot; di form penjualan untuk mencatat pesanan sementara.</p>
                    <Link
                      href="/penjualan/input"
                      className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      + Input Penjualan Baru
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
            <span className="text-slate-500">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                  href={pageHref(params, page - 1)}
                >
                  Sebelumnya
                </Link>
              )}
              {page < totalPages && (
                <Link
                  className="rounded-sm border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                  href={pageHref(params, page + 1)}
                >
                  Berikutnya
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
