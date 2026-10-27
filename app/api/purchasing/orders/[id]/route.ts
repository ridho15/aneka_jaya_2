import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getPurchaseOrderById, updatePurchaseOrderStatus } from "@/lib/purchasing/purchasingStore";
import type { PurchaseOrderStatus } from "@prisma/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const order = await getPurchaseOrderById(id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Purchase Order tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat detail Purchase Order." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.order.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const json = await request.json();
    const status = json.status as PurchaseOrderStatus;
    if (!status) {
      return NextResponse.json({ success: false, message: "Status wajib disertakan." }, { status: 400 });
    }

    const updated = await updatePurchaseOrderStatus(id, status, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memperbarui status Purchase Order." },
      { status: 400 }
    );
  }
}
