import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { completeDeliveryOrderShipping } from "@/lib/deliveryOrders/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!can(role, "do.process")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki hak akses proses Pengiriman DO." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const shippedItemIds = Array.isArray(body?.shippedItemIds) ? body.shippedItemIds : [];
  const receiptPhotoUrl = typeof body?.receiptPhotoUrl === "string" ? body.receiptPhotoUrl.trim() : undefined;
  const trackingNumber = typeof body?.trackingNumber === "string" ? body.trackingNumber.trim() : undefined;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : undefined;

  if (shippedItemIds.length === 0) {
    return NextResponse.json({ success: false, message: "Pilih setidaknya satu barang yang dikirim." }, { status: 400 });
  }

  try {
    const actor = await getCurrentUser();
    const updated = await completeDeliveryOrderShipping(
      id,
      { shippedItemIds, receiptPhotoUrl, trackingNumber, notes },
      actor
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses pengiriman DO.";
    const isValidationError =
      message.includes("Foto bukti pengiriman wajib dilampirkan") ||
      message.includes("Pilih setidaknya satu barang");
    const status = isValidationError ? 422 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
