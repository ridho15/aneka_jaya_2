import { NextResponse } from "next/server";
import { clearLocalSessionCookie } from "@/lib/auth/localSession";
import { resolveAuthProvider } from "@/lib/auth/request";
import { clearAnikaErpTokenCookie } from "@/lib/auth/anikaErp";

export async function POST() {
  const provider = resolveAuthProvider();
  if (provider !== "local_credentials" && provider !== "anika_erp") {
    return NextResponse.json({ success: false, message: "Logout internal tidak aktif." }, { status: 403 });
  }
  await clearLocalSessionCookie();
  if (provider === "anika_erp") await clearAnikaErpTokenCookie();
  return NextResponse.json({ success: true });
}
