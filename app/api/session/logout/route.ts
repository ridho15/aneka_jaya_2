import { NextResponse } from "next/server";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { ROLE_COOKIE } from "@/lib/auth/roles";

export async function POST() {
  if (!isDemoRoleSelectorEnabled()) {
    return NextResponse.json(
      { success: false, message: "Logout demo hanya tersedia untuk development teknis." },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ROLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 0
  });
  return response;
}
