import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { postSalesReturn } from "@/lib/sales/returnStore";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "penjualan.manage") && !can(user.role, "accounting.journal.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: "ID Retur Penjualan tidak valid." }, { status: 400 });
  }

  try {
    const posted = await postSalesReturn(id, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: posted });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memposting Retur Penjualan." },
      { status: 400 }
    );
  }
}
