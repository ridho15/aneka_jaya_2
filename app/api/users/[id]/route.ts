import { NextResponse } from "next/server";
import { updateUser, UserForbiddenError } from "@/lib/users/store";

function userErrorResponse(error: unknown) {
  if (error instanceof UserForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403 });
  return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "User management gagal." }, { status: 400 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await updateUser(id, await request.json().catch(() => null));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return userErrorResponse(error);
  }
}
