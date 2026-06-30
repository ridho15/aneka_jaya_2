import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { cancelExpenseRecord } from "@/lib/expenses/store";

const cancelSchema = z.object({ reason: z.string().trim().min(3, "Alasan cancel wajib diisi.") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "pengeluaran.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses cancel Pengeluaran." }, { status: 403 });
  }
  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Alasan cancel wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;
  try {
    const data = await cancelExpenseRecord(id, parsed.data.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pengeluaran gagal dibatalkan." }, { status: 400 });
  }
}
