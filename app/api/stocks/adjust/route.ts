import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { stockAdjustmentSchema } from "@/lib/validation/stockAdjustmentSchema";
import { createStockAdjustment } from "@/lib/api/stockAdjustments";

export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "stock.adjust")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses adjustment stok." }, { status: 403 });
  }
  const parsed = stockAdjustmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Mohon lengkapi data adjustment stok.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  }
  const response = await createStockAdjustment(parsed.data);
  return NextResponse.json(response, { status: response.success ? 201 : 502 });
}
