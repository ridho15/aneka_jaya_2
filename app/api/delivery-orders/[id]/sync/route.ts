import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { syncDeliveryOrderForSale } from "@/lib/deliveryOrders/store";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!can(role, "do.assign") && !can(role, "penjualan.create") && !can(role, "penjualan.manage") && !can(role, "do.process")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses untuk menyinkronkan DO." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID wajib disertakan." },
      { status: 400 }
    );
  }

  let salesRecordId = id;
  const doRow = await prisma.deliveryOrder.findFirst({
    where: { OR: [{ id }, { doNumber: id }, { salesRecordId: id }] },
    select: { salesRecordId: true }
  });

  if (doRow?.salesRecordId) {
    salesRecordId = doRow.salesRecordId;
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
