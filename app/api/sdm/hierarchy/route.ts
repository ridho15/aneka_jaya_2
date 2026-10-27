import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrganizationHierarchy, assignSupervisor } from "@/lib/sdm/hierarchyStore";

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses melihat struktur organisasi." },
      { status: 403 }
    );
  }

  try {
    const hierarchy = await getOrganizationHierarchy();
    return NextResponse.json({ success: true, data: hierarchy });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memuat struktur organisasi." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.employee.manage")) {
    return NextResponse.json(
      { success: false, message: "Tidak memiliki hak akses mengubah struktur organisasi." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.employeeId) {
    return NextResponse.json(
      { success: false, message: "ID Karyawan wajib disertakan." },
      { status: 400 }
    );
  }

  const supervisorId = body.supervisorId ? String(body.supervisorId) : null;
  const actor = { id: user.id, name: user.name, role: user.role };

  try {
    const updated = await assignSupervisor(body.employeeId, supervisorId, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memperbarui atasan karyawan." },
      { status: 400 }
    );
  }
}
