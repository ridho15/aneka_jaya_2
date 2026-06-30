import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { createWhatsappRecipient, updateWhatsappRecipient } from "@/lib/whatsapp/whatsappClient";
import { validationMessage, whatsappRecipientCreateSchema, whatsappRecipientUpdateSchema } from "@/lib/validation/settingsSchema";

export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "settings.whatsapp.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses WhatsApp settings." }, { status: 403 });
  }
  const parsed = whatsappRecipientCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Data recipient WhatsApp tidak valid.") }, { status: 400 });
  }
  const data = await createWhatsappRecipient(parsed.data);
  return NextResponse.json({ success: true, data });
}

export async function PUT(request: Request) {
  if (!can(await getCurrentRole(), "settings.whatsapp.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses WhatsApp settings." }, { status: 403 });
  }
  const parsed = whatsappRecipientUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: validationMessage(parsed.error, "Data recipient WhatsApp tidak valid.") }, { status: 400 });
  }
  const { id, ...input } = parsed.data;
  try {
    const data = await updateWhatsappRecipient(id, input);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Recipient WhatsApp gagal diubah." }, { status: 404 });
  }
}
