import { redirect } from "next/navigation";

/** "Stock Barang" digabung ke Inventory → Stok Gudang & Toko. */
export default async function LegacyStockListPage({ searchParams }: { searchParams: Promise<{ keyword?: string }> }) {
  const { keyword } = await searchParams;
  redirect(keyword ? `/inventory?keyword=${encodeURIComponent(keyword)}` : "/inventory");
}
