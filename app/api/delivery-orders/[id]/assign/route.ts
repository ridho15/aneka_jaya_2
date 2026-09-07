import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { assignDeliveryOrder } from "@/lib/deliveryOrders/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!can(role, "do.assign")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki hak akses untuk menugaskan Petugas DO." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { assignedUserId, assignedUserName } = body || {};

  if (!assignedUserId || !assignedUserName) {
    return NextResponse.json({ success: false, message: "ID dan nama petugas DO wajib diisi." }, { status: 400 });
  }

  try {
    const actor = await getCurrentUser();
    const updated = await assignDeliveryOrder(id, assignedUserId, assignedUserName, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menugaskan Petugas DO.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
