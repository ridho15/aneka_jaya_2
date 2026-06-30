import { NextResponse } from "next/server";
import { listStocks, listStocksPage } from "@/lib/api/stocks";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { checkStockMinimumAlert } from "@/lib/stockAlerts/store";

function numberParam(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function listParam(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "stock.view")) return NextResponse.json({ success: false, message: "Tidak punya akses Stock Barang." }, { status: 403 });
  const url = new URL(request.url);
  const hasQuery = ["page", "pageSize", "keyword", "productId", "sku", "warehouse", "productIds", "skus"].some((key) => url.searchParams.has(key));
  const options = {
    page: numberParam(url.searchParams.get("page")),
    pageSize: numberParam(url.searchParams.get("pageSize")),
    keyword: url.searchParams.get("keyword") || undefined,
    productId: url.searchParams.get("productId") || undefined,
    sku: url.searchParams.get("sku") || undefined,
    warehouse: url.searchParams.get("warehouse") || undefined,
    productIds: listParam(url.searchParams.get("productIds")),
    skus: listParam(url.searchParams.get("skus"))
  };
  const response = hasQuery ? await listStocksPage(options) : await listStocks();
  if (response.success) {
    const rows = Array.isArray(response.data) ? response.data : response.data.data;
    await Promise.allSettled(rows.map((stock) => checkStockMinimumAlert(stock)));
  }
  if (response.success && !Array.isArray(response.data)) {
    return NextResponse.json(
      { success: true, data: response.data.data, meta: response.data.meta },
      { status: 200 }
    );
  }
  return NextResponse.json(response, { status: response.success ? 200 : 502 });
}
