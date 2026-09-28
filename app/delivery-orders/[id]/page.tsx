import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeliveryOrderDetail, listDeliveryOfficers } from "@/lib/deliveryOrders/store";
import { DeliveryOrderDetailView } from "@/components/deliveryOrders/DeliveryOrderDetailView";

export const dynamic = "force-dynamic";

export default async function DeliveryOrderDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "do.view")) {
    redirect("/");
  }

  const { id } = await params;
  const detail = await getDeliveryOrderDetail(id, user);
  if (!detail) {
    notFound();
  }

  const officers = await listDeliveryOfficers();
  const canAssign = can(user.role, "do.assign");
  const canProcess = can(user.role, "do.process");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <DeliveryOrderDetailView
          initialDetail={detail}
          officers={officers}
          canAssign={canAssign}
          canProcess={canProcess}
          currentUserRole={user.role}
        />
      </div>
    </AppShell>
  );
}
