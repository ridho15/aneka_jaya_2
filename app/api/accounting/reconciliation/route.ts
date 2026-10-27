import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import {
  getAccountingReconciliationReport,
  reclassifyLegacyExpense
} from "@/lib/accounting/reconciliationStore";

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const report = await getAccountingReconciliationReport();
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat laporan rekonsiliasi." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.coa.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Memerlukan hak akses finance/owner." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { expenseId, newCategoryCode, employeeId } = body;

    if (!expenseId || !newCategoryCode) {
      return NextResponse.json(
        { success: false, message: "Parameter expenseId dan newCategoryCode wajib diisi." },
        { status: 400 }
      );
    }

    const updated = await reclassifyLegacyExpense(
      expenseId,
      newCategoryCode,
      employeeId,
      {
        id: user.id,
        name: user.name,
        role: user.role
      }
    );

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Pengeluaran historis berhasil direklasifikasi secara aman."
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal mereklasifikasi pengeluaran." },
      { status: 400 }
    );
  }
}
