import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrganizationTree } from "@/lib/sdm/employeeStore";

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses melihat struktur organisasi." }, { status: 403 });
  }

  try {
    const tree = await getOrganizationTree();
    return NextResponse.json({ success: true, data: tree });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat struktur organisasi." },
      { status: 500 }
    );
  }
}
