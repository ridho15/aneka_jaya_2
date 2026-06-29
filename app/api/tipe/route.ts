import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listBookkeepingTypes, saveBookkeepingTypes } from "@/lib/business/masterData";
import { recordAudit } from "@/lib/audit/store";

export async function GET() {
  if ((await getCurrentRole()) === "VIEWER") return NextResponse.json({ success: false, message: "Tidak punya akses lihat Tipe." }, { status: 403 });
  const types = await listBookkeepingTypes();
  return NextResponse.json({ success: true, data: types });
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.tipe.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Tipe." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const types = await listBookkeepingTypes();
  const id = `tipe-${Date.now()}`;
  const newTipe = { id, code: String(body?.code || id).trim(), name: String(body?.name || body?.code || id).trim(), isActive: true, sortOrder: types.length + 1 };
  types.push(newTipe);
  await saveBookkeepingTypes(types);
  await recordAudit({ entityType: "tipe", entityId: newTipe.id, action: "create", afterValue: newTipe, reason: "Tipe baru ditambahkan" });
  return NextResponse.json({ success: true, data: newTipe }, { status: 201 });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.tipe.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Tipe." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ success: false, message: "ID Tipe diperlukan." }, { status: 400 });
  const types = await listBookkeepingTypes();
  const index = types.findIndex((t) => t.id === body.id);
  if (index < 0) return NextResponse.json({ success: false, message: "Tipe tidak ditemukan." }, { status: 404 });
  const before = types[index];
  const after = { ...before, ...body };
  types[index] = after;
  await saveBookkeepingTypes(types);
  await recordAudit({ entityType: "tipe", entityId: after.id, action: "update", beforeValue: before, afterValue: after });
  return NextResponse.json({ success: true, data: after });
}
