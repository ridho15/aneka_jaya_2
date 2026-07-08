import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getOperationalProfitSetting, updateOperationalProfitSetting } from "@/lib/settings/profit";
import { operationalProfitSettingSchema, validationMessage } from "@/lib/validation/settingsSchema";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "settings.profit.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses lihat setting Profit Operasional." }, { status: 403 });
  const data = await getOperationalProfitSetting();
  return NextResponse.json({ success: true, data });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.profit.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Profit Operasional." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = operationalProfitSettingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Persentase Gross Profit Operasional tidak valid.") }, { status: 400 });
  try {
    const data = await updateOperationalProfitSetting(parsed.data.grossProfitPercent);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Setting Profit Operasional gagal disimpan." }, { status: 400 });
  }
}
