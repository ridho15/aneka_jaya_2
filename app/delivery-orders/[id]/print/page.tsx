import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeliveryOrderDetail } from "@/lib/deliveryOrders/store";
import { DeliveryOrderThermalPrint } from "@/components/deliveryOrders/DeliveryOrderThermalPrint";

export const dynamic = "force-dynamic";

export default async function DeliveryOrderPrintPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ auto?: string; userName?: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user.role, "do.view")) {
    redirect("/");
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const autoPrint = resolvedSearchParams?.auto === "true" || resolvedSearchParams?.auto === "1";

  const detail = await getDeliveryOrderDetail(id, user);
  if (!detail) {
    notFound();
  }

  // Username/account user yang menekan tombol cetak pada DO
  const printUserName = resolvedSearchParams?.userName || user.name || user.id || "";

  return (
    <DeliveryOrderThermalPrint
      detail={detail}
      autoPrint={autoPrint}
      printUserName={printUserName}
    />
  );
}
