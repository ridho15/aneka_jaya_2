import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listSuppliers, createSupplier } from "@/lib/purchasing/purchasingStore";
import { SupplierSchema } from "@/lib/validation/purchasingSchema";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || undefined;
  const currency = searchParams.get("currency") || undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;

  try {
    const suppliers = await listSuppliers({ keyword, currency, isActive });
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat supplier." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.order.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = SupplierSchema.parse(json);
    const supplier = await createSupplier(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuat supplier." },
      { status: 400 }
    );
  }
}
