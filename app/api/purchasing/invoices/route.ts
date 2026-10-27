import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listPurchaseInvoices, createPurchaseInvoice } from "@/lib/purchasing/purchasingStore";
import { PurchaseInvoiceSchema } from "@/lib/validation/purchasingSchema";
import type { PurchaseInvoiceStatus } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") as PurchaseInvoiceStatus) || undefined;
  const supplierId = searchParams.get("supplierId") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  try {
    const invoices = await listPurchaseInvoices({ status, supplierId, keyword });
    return NextResponse.json({ success: true, data: invoices });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat invoice pembelian." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.invoice.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = PurchaseInvoiceSchema.parse(json);
    const invoice = await createPurchaseInvoice(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal membuat invoice pembelian." },
      { status: 400 }
    );
  }
}
