import { NextResponse } from "next/server";
import { payTempo } from "@/lib/tempo/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "tempo.mark_paid")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses bayar Tempo." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  try {
    const { id } = await params;
    const data = await payTempo(id, {
      paymentDate: String(body?.paymentDate || new Date().toISOString().slice(0, 10)),
      amountPaid: Number(body?.amountPaid || 0),
      paymentMethod: body?.paymentMethod === "TF" || body?.paymentMethod === "Other" ? body.paymentMethod : "Cash",
      rekeningId: String(body?.rekeningId || ""),
      rekeningNameSnapshot: String(body?.rekeningNameSnapshot || body?.rekeningId || ""),
      attachmentUrl: body?.attachmentUrl ? String(body.attachmentUrl) : undefined,
      notes: body?.notes ? String(body.notes) : undefined
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pembayaran Tempo gagal." }, { status: 400 });
  }
}
