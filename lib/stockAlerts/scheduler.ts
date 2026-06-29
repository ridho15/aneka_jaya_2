import "server-only";
import { listStocks } from "@/lib/api/stocks";
import { checkStockMinimumAlert } from "./store";

export async function checkAllStockAlerts() {
  const stocks = await listStocks();
  if (!stocks.success) return [];
  const results = [];
  for (const stock of stocks.data) results.push(await checkStockMinimumAlert(stock));
  return results.filter(Boolean);
}
