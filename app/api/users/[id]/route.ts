import { NextResponse } from "next/server";
import { updateUser, UserForbiddenError } from "@/lib/users/store";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

function userErrorResponse(error: unknown) {
  if (error instanceof UserForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403 });
  return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "User management gagal." }, { status: 400 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "users.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses kelola user." }, { status: 403 });
  try {
    const { id } = await params;
    const data = await updateUser(id, await request.json().catch(() => null));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return userErrorResponse(error);
  }
}
