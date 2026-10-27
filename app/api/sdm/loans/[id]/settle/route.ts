import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdvanceSettlement } from "@/lib/sdm/loanStore";
import { advanceSettlementSchema } from "@/lib/validation/sdmSchema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.kasbon.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses memproses pertanggungjawaban uang muka." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = advanceSettlementSchema.safeParse({ ...body, loanId: id });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Data pertanggungjawaban tidak valid.", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const settlement = await recordAdvanceSettlement(parsed.data, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ success: true, message: "Pertanggungjawaban uang muka berhasil dicatat.", data: settlement }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memproses pertanggungjawaban." },
      { status: 400 }
    );
  }
}
