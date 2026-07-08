import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getSlmProfitSetting, updateSlmProfitSetting } from "@/lib/settings/profit";
import { slmProfitSettingSchema, validationMessage } from "@/lib/validation/settingsSchema";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "settings.profit.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses lihat setting Profit SLM." }, { status: 403 });
  const data = await getSlmProfitSetting();
  return NextResponse.json({ success: true, data });
}

export async function PUT(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "settings.profit.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola Profit SLM." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = slmProfitSettingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Persentase Gross Profit SLM tidak valid.") }, { status: 400 });
  try {
    const data = await updateSlmProfitSetting(parsed.data.grossProfitPercent);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Setting Profit SLM gagal disimpan." }, { status: 400 });
  }
}
