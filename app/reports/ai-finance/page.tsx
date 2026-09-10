import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentRole } from "@/lib/auth/session";
import { getFinancialAiForecast } from "@/lib/ai/financialAiService";
import { AiFinancialForecastView } from "@/components/finance/AiFinancialForecastView";

export const dynamic = "force-dynamic";

export default async function AiFinancialForecastPage() {
  const role = await getCurrentRole();
  if (role !== "OWNER") {
    redirect("/dashboard");
  }

  const forecastData = await getFinancialAiForecast();

  return (
    <AppShell>
      <AiFinancialForecastView initialData={forecastData} />
    </AppShell>
  );
}
