import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getGeneralLedger } from "@/lib/accounting/ledgerStore";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  if (!accountId) {
    return NextResponse.json({ success: false, message: "Parameter accountId wajib diisi." }, { status: 400 });
  }

  try {
    const report = await getGeneralLedger(accountId, { startDate, endDate });
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat buku besar." },
      { status: 500 }
    );
  }
}
