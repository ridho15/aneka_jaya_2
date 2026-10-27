import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/purchasing/purchasingStore";
import { PurchaseOrderSchema } from "@/lib/validation/purchasingSchema";
import type { PurchaseOrderStatus } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") as PurchaseOrderStatus) || undefined;
  const supplierId = searchParams.get("supplierId") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  try {
    const orders = await listPurchaseOrders({ status, supplierId, keyword });
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat Purchase Orders." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.order.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = PurchaseOrderSchema.parse(json);
    const order = await createPurchaseOrder(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuat Purchase Order." },
      { status: 400 }
    );
  }
}
