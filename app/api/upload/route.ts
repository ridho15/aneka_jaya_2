import { NextResponse } from "next/server";
import { uploadReceipt } from "@/lib/opencloud/storage";
import { getCurrentRole } from "@/lib/auth/session";
import { canUploadAttachment } from "@/lib/auth/apiPermissions";

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!canUploadAttachment(role)) return NextResponse.json({ success: false, message: "Tidak punya akses unggah lampiran." }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ success: false, message: "File tidak ditemukan.", code: "MISSING_FILE" }, { status: 400 });
  const response = await uploadReceipt(file);
  return NextResponse.json(response, { status: response.success ? 201 : 502 });
}
