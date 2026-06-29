import { NextResponse } from "next/server";
import { barangSchema } from "@/lib/validation/barangSchema";
import { getProduct, updateProduct } from "@/lib/api/products";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "stock.view")) return NextResponse.json({ success: false, message: "Tidak punya akses Stock Barang." }, { status: 403 });
  const { id } = await params;
  const response = await getProduct(id);
  return NextResponse.json(response, { status: response.success ? 200 : 404 });
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "stock.create")) return NextResponse.json({ success: false, message: "Tidak punya akses update Stock Barang." }, { status: 403 });
  const parsed = barangSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const response = await updateProduct(id, parsed.data);
  return NextResponse.json(response, { status: response.success ? 200 : 502 });
}
