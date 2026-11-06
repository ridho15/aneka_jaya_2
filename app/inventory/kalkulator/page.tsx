import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CostCalculator } from "@/components/inventory/CostCalculator";
import { InventoryHeader } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getCbmRate, getRmbRate } from "@/lib/inventory/pricing";

export const dynamic = "force-dynamic";

export default async function CostCalculatorPage() {
  const role = await getCurrentRole();
  if (!can(role, "inventory.master")) redirect("/no-access");
  const [rmb, cbm] = await Promise.all([getRmbRate(), getCbmRate()]);
  return (
    <AppShell>
      <InventoryHeader title="Kalkulator Modal Barang" description="Hitung modal per lusin/pack dan per pcs dari harga RMB per pcs, isi koli, dan CBM per koli." />
      <CostCalculator defaultRmbRate={rmb.rate} defaultCbmRate={cbm.rate} />
    </AppShell>
  );
}
