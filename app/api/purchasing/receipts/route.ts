import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { createPurchaseReceipt } from "@/lib/purchasing/purchasingStore";
import { PurchaseReceiptSchema } from "@/lib/validation/purchasingSchema";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "purchasing.order.manage")) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const validated = PurchaseReceiptSchema.parse(json);
    const receipt = await createPurchaseReceipt(validated, {
      id: user.id,
      name: user.name,
      role: user.role
    });
    return NextResponse.json({ success: true, data: receipt }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memproses penerimaan barang (GRN)." },
      { status: 400 }
    );
  }
}
