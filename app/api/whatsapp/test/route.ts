import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listWhatsappRecipients, sendWhatsappMessage } from "@/lib/whatsapp/whatsappClient";
import { APP_BRAND_NAME } from "@/lib/appBrand";

export async function POST() {
  if (!can(await getCurrentRole(), "settings.whatsapp.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses WhatsApp settings." }, { status: 403 });
  const recipient = (await listWhatsappRecipients()).find((row) => row.isActive);
  if (!recipient) return NextResponse.json({ success: false, message: "Recipient aktif belum ada." }, { status: 400 });
  try {
    const data = await sendWhatsappMessage(recipient, "test", `Test WhatsApp ${APP_BRAND_NAME}`);
    return NextResponse.json({ success: data.status === "sent", data }, { status: data.status === "sent" ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "WhatsApp gagal dikirim." }, { status: 503 });
  }
}
