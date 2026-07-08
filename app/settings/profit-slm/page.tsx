import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SlmProfitSettingsForm } from "@/components/settings/SlmProfitSettingsForm";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getSlmProfitSetting } from "@/lib/settings/profit";

export const dynamic = "force-dynamic";

export default async function ProfitSlmSettingsPage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.profit.manage")) redirect("/settings");
  const setting = await getSlmProfitSetting();

  return (
    <AppShell>
      <div className="mb-7">
        <h2 className="aj-page-title text-3xl font-bold">Profit SLM</h2>
        <p className="mt-2 text-sm text-slate-600">Atur persentase estimasi Gross Profit SLM yang dipakai dashboard.</p>
      </div>
      <SlmProfitSettingsForm initialSetting={setting} />
    </AppShell>
  );
}
