import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listDeliveryOfficers, listDeliveryOrders } from "@/lib/deliveryOrders/store";
import { DeliveryOrderQueueTable } from "@/components/deliveryOrders/DeliveryOrderQueueTable";

export const dynamic = "force-dynamic";

export default async function DeliveryOrdersPage() {
  const user = await getCurrentUser();
  if (!can(user.role, "do.view")) {
    redirect("/");
  }

  const queue = await listDeliveryOrders({}, user);
  const officers = await listDeliveryOfficers();

  const canAssign = can(user.role, "do.assign");
  const canProcess = can(user.role, "do.process");

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Delivery Order (DO)
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Antrean pengiriman pesanan, penugasan petugas DO, dan pemenuhan packing/kirim barang.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
              ⛟ Mode Pengiriman
            </span>
          </div>
        </div>

        <DeliveryOrderQueueTable
          initialQueue={queue}
          officers={officers}
          canAssign={canAssign}
          canProcess={canProcess}
          currentUserId={user.id}
          currentUserRole={user.role}
        />
      </div>
    </AppShell>
  );
}
