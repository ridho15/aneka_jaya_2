import { NextResponse } from "next/server";
import { payTempo } from "@/lib/tempo/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { tempoPaymentSchema } from "@/lib/validation/tempoSchema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "tempo.mark_paid")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses bayar Tempo." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = tempoPaymentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data pembayaran Tempo.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  try {
    const { id } = await params;
    const data = await payTempo(id, {
      paymentDate: parsed.data.paymentDate,
      amountPaid: parsed.data.amountPaid,
      paymentMethod: parsed.data.paymentMethod,
      rekeningId: parsed.data.rekeningId,
      rekeningNameSnapshot: "",
      attachmentUrl: parsed.data.attachmentUrl || undefined,
      notes: parsed.data.notes || undefined
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pembayaran Tempo gagal." }, { status: 400 });
  }
}
