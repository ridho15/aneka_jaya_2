import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listProductCategories, listUnitOfMeasures } from "@/lib/api/productReferences";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "penjualan.create") && !can(role, "stock.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses referensi produk ERP." }, { status: 403 });
  }
  const [categories, uoms] = await Promise.all([listProductCategories(), listUnitOfMeasures()]);
  if (!categories.success) return NextResponse.json(categories, { status: 502 });
  if (!uoms.success) return NextResponse.json(uoms, { status: 502 });
  return NextResponse.json({ success: true, data: { categories: categories.data, uoms: uoms.data } });
}
