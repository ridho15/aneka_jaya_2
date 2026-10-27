import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { calculateForexPreview } from "@/lib/purchasing/paymentStore";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId");
  const amountStr = searchParams.get("amount");
  const rateStr = searchParams.get("rate");

  if (!invoiceId || !amountStr || !rateStr) {
    return NextResponse.json(
      { success: false, message: "Parameter invoiceId, amount, dan rate wajib disertakan." },
      { status: 400 }
    );
  }

  const amountPaidOriginal = Number(amountStr);
  const paymentRate = Number(rateStr);

  if (isNaN(amountPaidOriginal) || amountPaidOriginal <= 0 || isNaN(paymentRate) || paymentRate <= 0) {
    return NextResponse.json(
      { success: false, message: "Nilai amount dan rate harus berupa angka positif." },
      { status: 400 }
    );
  }

  try {
    const preview = await calculateForexPreview({
      invoiceId,
      amountPaidOriginal,
      paymentRate
    });
    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menghitung selisih kurs." },
      { status: 400 }
    );
  }
}
