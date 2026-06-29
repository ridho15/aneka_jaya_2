import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { cancelTempo } from "@/lib/tempo/store";
import { tempoActionSchema } from "@/lib/validation/tempoSchema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "tempo.cancel")) return NextResponse.json({ success: false, message: "Tidak punya akses cancel Tempo." }, { status: 403 });
  const parsed = tempoActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Alasan cancel wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  try {
    const { id } = await params;
    const data = await cancelTempo(id, parsed.data.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Cancel Tempo gagal." }, { status: 400 });
  }
}
