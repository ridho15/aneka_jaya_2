import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listSalaryPayments, getSalarySummary } from "@/lib/sdm/salaryStore";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.salary.view")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses melihat data riwayat gaji." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodMonth = searchParams.get("period") || undefined;
  const employeeId = searchParams.get("employeeId") || undefined;
  const activeMonth = periodMonth || new Date().toISOString().slice(0, 7);

  try {
    const [items, summary] = await Promise.all([
      listSalaryPayments({ periodMonth, employeeId }),
      getSalarySummary(activeMonth)
    ]);
    return NextResponse.json({ success: true, data: { items, summary } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat riwayat gaji." },
      { status: 500 }
    );
  }
}
