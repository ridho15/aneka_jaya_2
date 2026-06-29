import { NextResponse } from "next/server";
import { isDemoRoleSelectorEnabled } from "@/lib/auth/demoUi";
import { ROLE_COOKIE, ROLES, parseRole } from "@/lib/auth/roles";

export async function POST(request: Request) {
  if (!isDemoRoleSelectorEnabled()) {
    return NextResponse.json(
      { success: false, message: "Pemilihan role manual hanya tersedia untuk development teknis." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => null);
  if (!ROLES.includes(body?.role)) return NextResponse.json({ success: false, message: "Peran tidak valid." }, { status: 400 });
  const response = NextResponse.json({ success: true, data: { role: parseRole(body.role) } });
  response.cookies.set(ROLE_COOKIE, body.role, { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 60 * 60 * 12 });
  return response;
}
