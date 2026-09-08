import { NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import {
  assignDeliveryOrder,
  addDeliveryOrderAssignee,
  removeDeliveryOrderAssignee
} from "@/lib/deliveryOrders/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  const actor = await getCurrentUser();
  const isAssignAuthorized = can(role, "do.assign");
  const isDeliveryDriver = role === "DELIVERY_DRIVER";

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { action = "replace", assignedUserId, assignedUserName } = body || {};

  // Action: "add" or "invite"
  if (action === "add" || action === "invite") {
    if (!isAssignAuthorized && !isDeliveryDriver) {
      return NextResponse.json(
        { success: false, message: "Tidak memiliki hak akses untuk mengundang Petugas DO." },
        { status: 403 }
      );
    }
    if (!assignedUserId || !assignedUserName) {
      return NextResponse.json(
        { success: false, message: "ID dan nama petugas DO wajib diisi." },
        { status: 400 }
      );
    }
    try {
      const updated = await addDeliveryOrderAssignee(id, assignedUserId, assignedUserName, actor);
      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menambahkan Petugas DO.";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Action: "remove"
  if (action === "remove") {
    if (!isAssignAuthorized && !isDeliveryDriver) {
      return NextResponse.json(
        { success: false, message: "Tidak memiliki hak akses untuk mengubah penugasan Petugas DO." },
        { status: 403 }
      );
    }
    if (!assignedUserId) {
      return NextResponse.json(
        { success: false, message: "ID petugas DO yang ingin dihapus wajib diisi." },
        { status: 400 }
      );
    }
    try {
      const updated = await removeDeliveryOrderAssignee(id, assignedUserId, actor);
      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus Petugas DO.";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Default Action: "replace" (legacy assignment)
  if (!isAssignAuthorized) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses untuk menugaskan Petugas DO." },
      { status: 403 }
    );
  }

  if (!assignedUserId || !assignedUserName) {
    return NextResponse.json(
      { success: false, message: "ID dan nama petugas DO wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const updated = await assignDeliveryOrder(id, assignedUserId, assignedUserName, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menugaskan Petugas DO.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

