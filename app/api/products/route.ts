import { NextResponse } from "next/server";
import { barangSchema } from "@/lib/validation/barangSchema";
import { createProduct, listProducts } from "@/lib/api/products";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { canListProducts } from "@/lib/auth/apiPermissions";

export async function GET() {
  if (!canListProducts(await getCurrentRole())) return NextResponse.json({ success: false, message: "Tidak punya akses Stock Barang." }, { status: 403 });
  const response = await listProducts();
  return NextResponse.json(response, { status: response.success ? 200 : 502 });
}
export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "stock.create")) return NextResponse.json({ success: false, message: "Tidak punya akses Input Stock Barang." }, { status: 403 });
  const parsed = barangSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  const response = await createProduct(parsed.data);
  return NextResponse.json(response, { status: response.success ? 201 : 502 });
}
