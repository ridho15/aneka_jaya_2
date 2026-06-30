import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { pengeluaranSchema } from "@/lib/validation/pengeluaranSchema";
import { updateExpenseRecord } from "@/lib/expenses/store";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "pengeluaran.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses kelola Pengeluaran." }, { status: 403 });
  }
  const parsed = pengeluaranSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Mohon lengkapi data pengeluaran yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;
  try {
    const data = await updateExpenseRecord(id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pengeluaran gagal diperbarui." }, { status: 400 });
  }
}
