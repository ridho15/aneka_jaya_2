import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { reopenAccountingPeriod } from "@/lib/accounting/periodStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.period.manage")) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Memerlukan hak akses kelola periode tutup buku." },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const json = await request.json().catch(() => ({}));
    const reason = typeof json?.reason === "string" && json.reason.trim()
      ? json.reason.trim()
      : "Pembukaan kembali oleh pengguna berwenang";

    const period = await reopenAccountingPeriod(
      id,
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      reason
    );
    return NextResponse.json({ success: true, data: period, message: "Periode akuntansi dibuka kembali." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuka kembali periode." },
      { status: 400 }
    );
  }
}
