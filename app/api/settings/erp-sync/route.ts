import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getErpSyncSetting, updateErpSyncSetting } from "@/lib/settings/erpSync";
import { erpSyncSettingSchema, validationMessage } from "@/lib/validation/settingsSchema";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "settings.erp_sync.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses lihat setting ERP Sync." }, { status: 403 });
  const data = await getErpSyncSetting();
  return NextResponse.json({ success: true, data });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.erp_sync.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola setting ERP Sync." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = erpSyncSettingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Setting ERP Sync tidak valid.") }, { status: 400 });
  try {
    const data = await updateErpSyncSetting(parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Setting ERP Sync gagal disimpan." }, { status: 400 });
  }
}
