import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getSupplierById, updateSupplier } from "@/lib/purchasing/purchasingStore";
import { SupplierSchema } from "@/lib/validation/purchasingSchema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const supplier = await getSupplierById(id);
    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat detail supplier." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.order.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const json = await request.json();
    const validated = SupplierSchema.parse(json);
    const updated = await updateSupplier(id, validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memperbarui supplier." },
      { status: 400 }
    );
  }
}
