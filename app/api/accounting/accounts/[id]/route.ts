import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getAccountById, updateAccount, deleteAccount } from "@/lib/accounting/accountStore";
import { accountSchema } from "@/lib/validation/accountingSchema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const account = await getAccountById(id);
    if (!account) {
      return NextResponse.json({ success: false, message: "Akun tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat akun." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.coa.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Memerlukan hak akses kelola COA." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const json = await request.json();
    const validated = accountSchema.partial().parse(json);
    const updated = await updateAccount(id, validated, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memperbarui akun." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.coa.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Memerlukan hak akses kelola COA." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const deactivated = await deleteAccount(id, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ success: true, data: deactivated, message: "Akun dinonaktifkan." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menonaktifkan akun." },
      { status: 400 }
    );
  }
}
