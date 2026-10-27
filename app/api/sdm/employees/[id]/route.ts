import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getEmployeeById, updateEmployee, deleteEmployee } from "@/lib/sdm/employeeStore";
import { employeeSchema } from "@/lib/validation/sdmSchema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.view")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses melihat data SDM." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, message: "Karyawan tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat data karyawan." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.employee.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses mengelola data karyawan." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Data karyawan tidak valid.", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateEmployee(id, parsed.data, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memperbarui data karyawan." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sdm.employee.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses menghapus data karyawan." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await deleteEmployee(id, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ success: true, message: "Data karyawan berhasil dihapus atau dinonaktifkan.", data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menghapus data karyawan." },
      { status: 400 }
    );
  }
}
