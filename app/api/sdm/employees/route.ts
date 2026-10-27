import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listEmployees, createEmployee } from "@/lib/sdm/employeeStore";
import { employeeSchema } from "@/lib/validation/sdmSchema";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses melihat data SDM." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isActiveParam = searchParams.get("isActive");
  const department = searchParams.get("department") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  const isActive = isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

  try {
    const employees = await listEmployees({ isActive, department, keyword });
    return NextResponse.json({ success: true, data: employees });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat data karyawan." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.employee.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses mengelola data karyawan." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    const errorDetails = Object.entries(parsed.error.flatten().fieldErrors)
      .map(([field, msgs]) => `${field}: ${(msgs || []).join(", ")}`)
      .join("; ");
    return NextResponse.json(
      {
        success: false,
        message: `Data karyawan tidak valid${errorDetails ? `: ${errorDetails}` : "."}`,
        errors: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const employee = await createEmployee(parsed.data, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ success: true, data: employee }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menambahkan karyawan." },
      { status: 400 }
    );
  }
}
