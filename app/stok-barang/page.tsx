import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/ui/ErrorState";
import { StockList } from "@/components/stocks/StockList";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listStocksPage } from "@/lib/api/stocks";

export const dynamic = "force-dynamic";
type SearchParams = Promise<{ page?: string; pageSize?: string; keyword?: string; productId?: string; sku?: string; warehouse?: string }>;

function toNumber(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export default async function StokBarangPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getCurrentRole();
  if (!can(role, "stock.view")) redirect("/penjualan/input");
  const params = await searchParams;
  const response = await listStocksPage({
    page: toNumber(params.page),
    pageSize: toNumber(params.pageSize) || 10,
    keyword: params.keyword,
    productId: params.productId,
    sku: params.sku,
    warehouse: params.warehouse
  });
  const filters = { keyword: params.keyword || "", productId: params.productId || "", sku: params.sku || "", warehouse: params.warehouse || "" };
  const listKey = JSON.stringify([response.success ? response.data.meta.page : params.page || "1", params.pageSize || "10", ...Object.values(filters)]);
  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Stock</p>
          <h2 className="aj-page-title text-3xl font-bold">Stok Barang</h2>
          <p className="mt-2 text-sm text-slate-600">Tampilan stok ERP per gudang/rak. Gunakan filter produk agar tidak mengambil seluruh data stok.</p>
        </div>
        {role === "OWNER" && (
          <div>
            <Link
              href="/stok-barang/ai-forecast"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 sm:text-sm"
            >
              <span>Prediksi Stok & Dead Stock</span>
            </Link>
          </div>
        )}
      </div>
      {response.success ? <StockList key={listKey} initialStocks={response.data.data} initialMeta={response.data.meta} initialFilters={filters} /> : <ErrorState message={response.message} />}
    </AppShell>
  );
}

