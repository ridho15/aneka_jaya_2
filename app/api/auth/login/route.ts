import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth/localCredentials";
import { resolveAuthProvider } from "@/lib/auth/request";
import { loginWithAnikaErp } from "@/lib/auth/anikaErp";

export async function POST(request: Request) {
  const provider = resolveAuthProvider();
  if (provider !== "local_credentials" && provider !== "anika_erp") {
    return NextResponse.json({ success: false, message: "Login internal tidak aktif." }, { status: 403 });
  }

  try {
    const input = await request.json().catch(() => null);
    let data;
    try {
      data = await loginWithPassword(input);
    } catch (localErr: any) {
      console.error("[login route] localErr:", localErr?.message, localErr);
      if (provider === "anika_erp") {
        data = await loginWithAnikaErp(input);
      } else {
        throw localErr;
      }
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Login gagal." },
      { status: 401 }
    );
  }
}
