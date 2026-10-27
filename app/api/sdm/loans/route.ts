import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listEmployeeLoanOverview, listEmployeeLoans } from "@/lib/sdm/loanStore";
import type { LoanType, LoanStatus } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses melihat data kasbon/uang muka." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode"); // "overview" or "list"
  const type = (searchParams.get("type") as LoanType) || undefined;
  const status = (searchParams.get("status") as LoanStatus) || undefined;
  const employeeId = searchParams.get("employeeId") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  try {
    if (mode === "overview") {
      const overview = await listEmployeeLoanOverview(type || "KASBON");
      return NextResponse.json({ success: true, data: overview });
    }

    const loans = await listEmployeeLoans({ loanType: type, status, employeeId, keyword });
    return NextResponse.json({ success: true, data: loans });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat data kasbon/uang muka." },
      { status: 500 }
    );
  }
}
