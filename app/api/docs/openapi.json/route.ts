import { NextResponse } from "next/server";
import { readOpenApiDocument } from "@/lib/apiDocs/openapi";
import { getCurrentRole } from "@/lib/auth/session";

async function assertOwner() {
  return (await getCurrentRole()) === "OWNER";
}

export async function GET() {
  if (!await assertOwner()) return NextResponse.json({ success: false, message: "Tidak punya akses dokumentasi API." }, { status: 403 });
  return NextResponse.json(await readOpenApiDocument());
}
