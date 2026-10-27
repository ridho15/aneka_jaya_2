import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listPurchasePayments, createPurchasePayment } from "@/lib/purchasing/paymentStore";
import { PurchasePaymentSchema } from "@/lib/validation/purchasingSchema";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.view")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId") || undefined;
  const purchaseInvoiceId = searchParams.get("purchaseInvoiceId") || undefined;

  try {
    const payments = await listPurchasePayments({ supplierId, purchaseInvoiceId });
    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memuat pembayaran supplier." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.payment.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = PurchasePaymentSchema.parse(json);
    const payment = await createPurchasePayment(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memproses pembayaran supplier." },
      { status: 400 }
    );
  }
}
