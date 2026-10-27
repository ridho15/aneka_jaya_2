import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listSalesReturns, createSalesReturn } from "@/lib/sales/returnStore";
import { SalesReturnSchema } from "@/lib/validation/salesReturnSchema";
import type { SalesReturnStatus } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (
    !can(user.role, "penjualan.manage") &&
    !can(user.role, "penjualan.create") &&
    !can(user.role, "accounting.view") &&
    !can(user.role, "tempo.view")
  ) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") as SalesReturnStatus) || undefined;
  const salesRecordId = searchParams.get("salesRecordId") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  try {
    const returns = await listSalesReturns({ status, salesRecordId, keyword });
    return NextResponse.json({ success: true, data: returns });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat Retur Penjualan." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "penjualan.create") && !can(user.role, "penjualan.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = SalesReturnSchema.parse(json);
    const returnRecord = await createSalesReturn(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: returnRecord }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuat Retur Penjualan." },
      { status: 400 }
    );
  }
}
