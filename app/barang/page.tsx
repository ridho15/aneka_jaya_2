import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductList } from "@/components/products/ProductList";
import { ErrorState } from "@/components/ui/ErrorState";
import { listProductTablePage } from "@/lib/api/products";
import { listStocks } from "@/lib/api/stocks";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
type SearchParams = Promise<{ page?: string; keyword?: string }>;

function toNumber(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export default async function BarangPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getCurrentRole();
  if (!can(role, "stock.view")) return <AppShell><ErrorState message="Tidak punya akses Stock Barang." /></AppShell>;
  const params = await searchParams;
  const response = await listProductTablePage({ page: toNumber(params.page), pageSize: 10, keyword: params.keyword });
  const stocks = response.success ? await listStocks({
    pageSize: 100,
    maxPages: 1,
    productIds: response.data.data.map((product) => product.productId || product.id).filter(Boolean),
    skus: response.data.data.map((product) => product.code).filter(Boolean)
  }) : null;
  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="aj-page-title text-3xl font-bold">Stock Barang</h2>
          <p className="mt-2 text-sm text-slate-600">Data barang dan quantity terbaru ditarik dari ERP setiap 30 detik. Minimum stock akan memicu alert WhatsApp hanya bila qty dan minimum valid.</p>
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
      {response.success ? <ProductList products={response.data.data} productMeta={response.data.meta} initialKeyword={params.keyword || ""} stocks={stocks?.success ? stocks.data : []} initialStockError={stocks?.success ? null : stocks?.message ?? null} canManage={can(role, "stock.manage")} /> : <ErrorState message={response.message} />}
    </AppShell>
  );
}
