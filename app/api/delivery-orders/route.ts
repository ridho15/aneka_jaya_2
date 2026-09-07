import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import {
  createDeliveryOrderForSale,
  listDeliveryOfficers,
  listDeliveryOrders
} from "@/lib/deliveryOrders/store";

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "do.view")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki akses melihat Delivery Order." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const packingStatus = searchParams.get("packingStatus") || undefined;
  const shippingStatus = searchParams.get("shippingStatus") || undefined;
  const assignedUserId = searchParams.get("assignedUserId") || undefined;
  const search = searchParams.get("search") || undefined;

  const user = await getCurrentUser();
  const queue = await listDeliveryOrders({ status, packingStatus, shippingStatus, assignedUserId, search }, user);
  const officers = await listDeliveryOfficers();

  return NextResponse.json({
    success: true,
    data: queue,
    officers
  });
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "do.assign") && !can(role, "penjualan.create")) {
    return NextResponse.json({ success: false, message: "Tidak memiliki hak akses untuk membuat DO." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const salesRecordId = body?.salesRecordId;

  if (!salesRecordId || typeof salesRecordId !== "string") {
    return NextResponse.json({ success: false, message: "salesRecordId wajib disertakan." }, { status: 400 });
  }

  try {
    const created = await createDeliveryOrderForSale(salesRecordId);
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat Delivery Order.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
