import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { updateDeliveryOrderReceiptPhotos } from "@/lib/deliveryOrders/store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!can(role, "do.process")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses mengubah foto bukti DO." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const receiptPhotoUrl = typeof body?.receiptPhotoUrl === "string" ? body.receiptPhotoUrl.trim() : "";

  try {
    const actor = await getCurrentUser();
    const updated = await updateDeliveryOrderReceiptPhotos(id, receiptPhotoUrl, actor);
    return NextResponse.json({
      success: true,
      message: "Foto bukti pengiriman berhasil diperbarui.",
      data: updated
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui foto bukti DO.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context);
}
