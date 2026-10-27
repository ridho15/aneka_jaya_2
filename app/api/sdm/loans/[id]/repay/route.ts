import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { recordLoanRepayment } from "@/lib/sdm/loanStore";
import { loanRepaymentSchema } from "@/lib/validation/sdmSchema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.kasbon.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses mencatat pelunasan kasbon." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = loanRepaymentSchema.safeParse({ ...body, loanId: id });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Data pelunasan tidak valid.", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payment = await recordLoanRepayment(parsed.data, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ success: true, message: "Pelunasan kasbon berhasil dicatat.", data: payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal mencatat pelunasan kasbon." },
      { status: 400 }
    );
  }
}
