import { NextResponse } from "next/server";
import { createUser, listUsers, UserForbiddenError } from "@/lib/users/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

function userErrorResponse(error: unknown) {
  if (error instanceof UserForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403 });
  return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "User management gagal." }, { status: 400 });
}

export async function GET() {
  if (!can(await getCurrentRole(), "users.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola user." }, { status: 403 });
  try {
    return NextResponse.json({ success: true, data: await listUsers() });
  } catch (error) {
    return userErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "users.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola user." }, { status: 403 });
  try {
    const data = await createUser(await request.json().catch(() => null));
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return userErrorResponse(error);
  }
}
