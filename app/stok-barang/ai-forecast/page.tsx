import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getInventoryAiForecast } from "@/lib/ai/inventoryForecast";
import { AiInventoryForecastView } from "@/components/stocks/AiInventoryForecastView";

export const dynamic = "force-dynamic";

export default async function AiInventoryForecastPage() {
  const role = await getCurrentRole();
  if (!can(role, "stock.view") && !can(role, "reports.view")) {
    redirect("/stok-barang");
  }

  const forecastData = await getInventoryAiForecast();

  return (
    <AppShell>
      <AiInventoryForecastView initialData={forecastData} />
    </AppShell>
  );
}
