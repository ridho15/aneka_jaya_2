import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getDeliveryOrderDetail } from "@/lib/deliveryOrders/store";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "do.view")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki akses melihat Delivery Order." }, { status: 403 });
  }

  const { id } = await context.params;
  const detail = await getDeliveryOrderDetail(id, user);

  if (!detail) {
    return NextResponse.json({ success: false, message: "Delivery Order tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: detail
  });
}
