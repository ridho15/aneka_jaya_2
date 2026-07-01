import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/ui/ErrorState";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getStockDetail } from "@/lib/api/stocks";
import { stockDetailReturnTo } from "@/lib/stocks/detail";

export const dynamic = "force-dynamic";

const dash = "—";
const formatNumber = (value: number | null | undefined) => value === null || value === undefined
  ? dash
  : new Intl.NumberFormat("id-ID").format(value);

type DetailParams = Promise<{ productKey: string }>;
type DetailSearchParams = Promise<{ sku?: string; returnTo?: string }>;

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-l border-neutral-300 pl-4"><p className="text-xs font-semibold text-neutral-500">{label}</p><p className="mt-1 text-xl font-bold text-neutral-950">{value}</p></div>;
}

export default async function StockDetailPage({ params, searchParams }: { params: DetailParams; searchParams: DetailSearchParams }) {
  const role = await getCurrentRole();
  if (!can(role, "stock.view")) redirect("/penjualan/input");

  const [{ productKey }, query] = await Promise.all([params, searchParams]);
  const result = await getStockDetail(productKey, query.sku);
  const returnTo = stockDetailReturnTo(query.returnTo);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-emerald-600">Stock</p>
          <h2 className="aj-page-title text-3xl font-bold">Detail Stok Barang</h2>
          <p className="mt-2 text-sm text-slate-600">Stok ERP per gudang dan rak.</p>
        </div>
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline" href={returnTo}>Kembali ke daftar stok</Link>
      </div>

      {!result.success ? <ErrorState message={result.message} /> : (
        <>
          <section className="aj-surface mb-5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-emerald-700">{result.data.sku}</p>
                <h3 className="mt-1 text-2xl font-bold text-neutral-950">{result.data.productName}</h3>
                {result.data.productId && <p className="mt-1 text-xs text-neutral-500">Product ID: {result.data.productId}</p>}
              </div>
              <span className={`inline-flex self-start px-3 py-1.5 text-xs font-bold ${result.data.summary.isLowStock ? "bg-red-50 text-red-700" : result.data.summary.ready === false ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                {result.data.summary.isLowStock ? "Stok rendah" : result.data.summary.ready === false ? "Tidak ready" : result.data.summary.ready === true ? "Ready" : "Status tidak tersedia"}
              </span>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Qty tersedia" value={formatNumber(result.data.summary.quantity)} />
              <Metric label="Minimum" value={formatNumber(result.data.summary.minimumStock)} />
              <Metric label="Gudang" value={formatNumber(result.data.summary.warehouseCount)} />
              <Metric label="Rak" value={formatNumber(result.data.summary.rackCount)} />
            </div>
          </section>

          {result.data.stocks.length === 0 ? (
            <section className="aj-surface p-8 text-center">
              <h3 className="font-bold text-neutral-950">Stok belum tersedia</h3>
              <p className="mt-2 text-sm text-neutral-500">Produk ditemukan, tetapi ERP belum mengembalikan stok untuk referensi ini.</p>
            </section>
          ) : (
            <section className="aj-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr><th className="px-5 py-3">Gudang</th><th className="px-5 py-3">Rak</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3 text-right">Free</th><th className="px-5 py-3 text-right">On hand</th><th className="px-5 py-3 text-right">Reserved</th><th className="px-5 py-3 text-right">Minimum</th><th className="px-5 py-3">Satuan</th><th className="px-5 py-3">Status</th></tr>
                  </thead>
                  <tbody>{result.data.stocks.map((stock) => (
                    <tr key={stock.id} className="border-b border-neutral-100">
                      <td className="px-5 py-4 font-semibold">{stock.warehouse || dash}</td>
                      <td className="px-5 py-4">{stock.rack || dash}</td>
                      <td className="px-5 py-4 text-right">{formatNumber(stock.quantity)}</td>
                      <td className="px-5 py-4 text-right">{formatNumber(stock.freeQuantity)}</td>
                      <td className="px-5 py-4 text-right">{formatNumber(stock.onHandQuantity)}</td>
                      <td className="px-5 py-4 text-right">{formatNumber(stock.reservedQuantity)}</td>
                      <td className="px-5 py-4 text-right">{formatNumber(stock.minimumStock)}</td>
                      <td className="px-5 py-4">{stock.unit || dash}</td>
                      <td className="px-5 py-4">{stock.ready === true ? "Ready" : stock.ready === false ? "Tidak ready" : dash}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
