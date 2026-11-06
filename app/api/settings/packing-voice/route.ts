import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { getCurrentRole, getCurrentUser } from "@/lib/auth/session";
import {
  findLateUnpacked,
  getPackingVoiceSettings,
  listVoiceAnnouncements,
  previewOnCamera,
  savePackingVoiceSettings,
  speakOnCamera,
} from "@/lib/cctv/packingVoice";
import { announcementText } from "@/lib/cctv/packingVoiceRules";

const settingsSchema = z.object({
  enabled: z.boolean(),
  dryRun: z.boolean(),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200),
});
const actionSchema = z.object({ action: z.enum(["preview", "test"]), text: z.string().trim().max(600).optional() });
const TEST_TEXT = "Uji suara pengumuman tim packing. Terima kasih.";

async function denied() {
  const role = await getCurrentRole();
  return can(role, "settings.whatsapp.manage")
    ? null
    : NextResponse.json({ success: false, message: "Tidak punya akses mengatur pengingat suara." }, { status: 403 });
}

export async function GET() {
  const blocked = await denied();
  if (blocked) return blocked;
  const [settings, announcements, late] = await Promise.all([getPackingVoiceSettings(), listVoiceAnnouncements(), findLateUnpacked(new Date())]);
  return NextResponse.json({ success: true, data: { settings, announcements, lateNow: late.length, nextText: late.length ? announcementText(late) : null } });
}

export async function PUT(request: Request) {
  const blocked = await denied();
  if (blocked) return blocked;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Pengaturan tidak valid." }, { status: 400 });
  const user = await getCurrentUser();
  const settings = await savePackingVoiceSettings(parsed.data, user);
  return NextResponse.json({ success: true, data: { settings } });
}

// preview: suara diputar di browser; test: satu kalimat uji di speaker kamera (mengikuti mode uji).
export async function POST(request: Request) {
  const blocked = await denied();
  if (blocked) return blocked;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  const text = parsed.data.text || TEST_TEXT;
  if (parsed.data.action === "preview") {
    try {
      const response = await previewOnCamera(text);
      if (!response.ok) return NextResponse.json({ success: false, message: `Server CCTV: HTTP ${response.status}` }, { status: 502 });
      return new Response(await response.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Pratinjau gagal." }, { status: 502 });
    }
  }
  const settings = await getPackingVoiceSettings();
  const result = await speakOnCamera(text, settings.dryRun);
  return NextResponse.json({ success: true, data: { ...result, dryRun: settings.dryRun } });
}
