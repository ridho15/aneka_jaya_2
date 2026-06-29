import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { canViewMasterData } from "@/lib/auth/apiPermissions";
import { listBookkeepingTypes, saveBookkeepingTypes } from "@/lib/business/masterData";
import { recordAudit } from "@/lib/audit/store";
import { tipeCreateSchema, tipeUpdateSchema, validationMessage } from "@/lib/validation/settingsSchema";

export async function GET() {
  const role = await getCurrentRole();
  if (!canViewMasterData(role) && !can(role, "settings.tipe.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses lihat Tipe." }, { status: 403 });
  const types = await listBookkeepingTypes();
  return NextResponse.json({ success: true, data: types });
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.tipe.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Tipe." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = tipeCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Kode dan nama tipe tidak valid.") }, { status: 400 });
  const types = await listBookkeepingTypes();
  if (types.some((type) => type.code.toUpperCase() === parsed.data.code)) return NextResponse.json({ success: false, message: `Kode tipe ${parsed.data.code} sudah digunakan.` }, { status: 409 });
  const id = `tipe-${Date.now()}`;
  const newTipe = { id, code: parsed.data.code, name: parsed.data.name, isActive: true, sortOrder: types.length + 1 };
  types.push(newTipe);
  await saveBookkeepingTypes(types);
  await recordAudit({ entityType: "tipe", entityId: newTipe.id, action: "create", afterValue: newTipe, reason: "Tipe baru ditambahkan" });
  return NextResponse.json({ success: true, data: newTipe }, { status: 201 });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.tipe.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Tipe." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = tipeUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Data tipe tidak valid.") }, { status: 400 });
  const types = await listBookkeepingTypes();
  const index = types.findIndex((t) => t.id === parsed.data.id);
  if (index < 0) return NextResponse.json({ success: false, message: "Tipe tidak ditemukan." }, { status: 404 });
  if (parsed.data.code && types.some((type) => type.id !== parsed.data.id && type.code.toUpperCase() === parsed.data.code)) return NextResponse.json({ success: false, message: `Kode tipe ${parsed.data.code} sudah digunakan.` }, { status: 409 });
  const before = types[index];
  const after = { ...before, ...parsed.data };
  types[index] = after;
  await saveBookkeepingTypes(types);
  await recordAudit({ entityType: "tipe", entityId: after.id, action: "update", beforeValue: before, afterValue: after });
  return NextResponse.json({ success: true, data: after });
}
