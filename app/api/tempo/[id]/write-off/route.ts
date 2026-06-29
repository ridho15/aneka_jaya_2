import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { writeOffTempo } from "@/lib/tempo/store";
import { tempoActionSchema } from "@/lib/validation/tempoSchema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "tempo.write_off")) return NextResponse.json({ success: false, message: "Tidak punya akses write-off Tempo." }, { status: 403 });
  const parsed = tempoActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Alasan write-off wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  try {
    const { id } = await params;
    const data = await writeOffTempo(id, parsed.data.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Write-off Tempo gagal." }, { status: 400 });
  }
}
