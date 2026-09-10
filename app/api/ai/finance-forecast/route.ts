import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/auth/session";
import { getFinancialAiForecast } from "@/lib/ai/financialAiService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (role !== "OWNER") {
    return NextResponse.json(
      { success: false, message: "Akses ditolak: Hanya Super Admin (Owner) yang dapat mengakses AI Keuangan." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("force") === "true";

  try {
    const data = await getFinancialAiForecast({ forceRefresh });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[Financial AI Forecast Error]:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Gagal memproses prediksi keuangan AI."
      },
      { status: 500 }
    );
  }
}
