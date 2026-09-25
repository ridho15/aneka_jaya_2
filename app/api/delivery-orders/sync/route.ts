import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { syncDeliveryOrderForSale } from "@/lib/deliveryOrders/store";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "do.assign") && !can(role, "penjualan.create") && !can(role, "penjualan.manage") && !can(role, "do.process")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses untuk menyinkronkan DO." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  let salesRecordId = body?.salesRecordId;
  const deliveryOrderId = body?.deliveryOrderId || body?.id;

  if (!salesRecordId && deliveryOrderId) {
    const doRow = await prisma.deliveryOrder.findFirst({
      where: { OR: [{ id: deliveryOrderId }, { doNumber: deliveryOrderId }] },
      select: { salesRecordId: true }
    });
    salesRecordId = doRow?.salesRecordId;
  }

  if (!salesRecordId || typeof salesRecordId !== "string") {
    return NextResponse.json(
      { success: false, message: "salesRecordId atau deliveryOrderId wajib disertakan." },
      { status: 400 }
    );
  }

  try {
    const synced = await syncDeliveryOrderForSale(salesRecordId);
    return NextResponse.json({
      success: true,
      message: `Delivery Order berhasil disinkronkan (${synced?.items?.length || 0} item).`,
      data: synced
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyinkronkan Delivery Order.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
