import { NextResponse } from "next/server";
import { listStocks } from "@/lib/api/stocks";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { checkStockMinimumAlert } from "@/lib/stockAlerts/store";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "stock.view")) return NextResponse.json({ success: false, message: "Tidak punya akses Stock Barang." }, { status: 403 });
  const response = await listStocks();
  if (response.success) await Promise.all(response.data.map((stock) => checkStockMinimumAlert(stock)));
  return NextResponse.json(response, { status: response.success ? 200 : 502 });
}
