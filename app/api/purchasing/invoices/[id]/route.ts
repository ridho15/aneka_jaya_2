import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getPurchaseInvoiceById, postPurchaseInvoice } from "@/lib/purchasing/purchasingStore";

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
    const invoice = await getPurchaseInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat detail invoice." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.invoice.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const posted = await postPurchaseInvoice(id, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: posted });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal mem-posting invoice pembelian." },
      { status: 400 }
    );
  }
}
