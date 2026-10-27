import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getIncomeStatement } from "@/lib/reports/financialStatements";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "reports.finance_view") && !can(user.role, "accounting.view")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses melihat Laporan Laba Rugi." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const tipeId = searchParams.get("tipeId") || undefined;

  try {
    const report = await getIncomeStatement({ startDate, endDate, tipeId });
    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memuat Laporan Laba Rugi." },
      { status: 500 }
    );
  }
}
