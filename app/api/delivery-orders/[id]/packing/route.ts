import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { updateDeliveryOrderPacking } from "@/lib/deliveryOrders/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!can(role, "do.process")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki hak akses proses Packing DO." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const packedItemIds = Array.isArray(body?.packedItemIds) ? body.packedItemIds : [];

  try {
    const actor = await getCurrentUser();
    const updated = await updateDeliveryOrderPacking(id, packedItemIds, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengupdate status packing.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
