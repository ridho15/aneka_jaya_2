import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listAccountingPeriods, closeAccountingPeriod } from "@/lib/accounting/periodStore";
import { periodClosingSchema } from "@/lib/validation/accountingSchema";

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const periods = await listAccountingPeriods();
    return NextResponse.json({ success: true, data: periods });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat periode akuntansi." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.period.manage")) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Memerlukan hak akses kelola periode tutup buku." },
      { status: 403 }
    );
  }

  try {
    const json = await request.json();
    const validated = periodClosingSchema.parse(json);
    const closed = await closeAccountingPeriod(
      validated.periodKey,
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      validated.notes
    );
    return NextResponse.json({ success: true, data: closed, message: "Periode akuntansi berhasil ditutup dan dikunci." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menutup periode." },
      { status: 400 }
    );
  }
}
