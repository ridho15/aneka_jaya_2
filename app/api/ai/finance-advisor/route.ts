import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/auth/session";
import { askFinancialCfo } from "@/lib/ai/financialAiService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (role !== "OWNER") {
    return NextResponse.json(
      { success: false, message: "Akses ditolak: Hanya Super Admin (Owner) yang dapat mengakses AI Keuangan." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json(
        { success: false, message: "Pertanyaan wajib diisi." },
        { status: 400 }
      );
    }

    const advice = await askFinancialCfo(question);
    return NextResponse.json({ success: true, data: advice });
  } catch (error: any) {
    console.error("[Financial AI Advisor Error]:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Gagal memproses konsultasi keuangan AI."
      },
      { status: 500 }
    );
  }
}
