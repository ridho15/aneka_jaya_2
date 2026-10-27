import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getTrialBalance } from "@/lib/accounting/ledgerStore";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const asOfDate = searchParams.get("asOfDate") || undefined;
  const startDate = searchParams.get("startDate") || undefined;

  try {
    const report = await getTrialBalance({ startDate, endDate: asOfDate });
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat neraca saldo." },
      { status: 500 }
    );
  }
}
