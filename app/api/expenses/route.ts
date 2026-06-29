import { NextResponse } from "next/server";
import { pengeluaranSchema } from "@/lib/validation/pengeluaranSchema";
import { createExpense } from "@/lib/api/expenses";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "pengeluaran.create")) return NextResponse.json({ success: false, message: "Tidak punya akses Input Pengeluaran." }, { status: 403 });
  const parsed = pengeluaranSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  try {
    const response = await createExpense(parsed.data);
    return NextResponse.json(response, { status: response.success ? 201 : 502 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pengeluaran gagal disimpan." }, { status: 400 });
  }
}
