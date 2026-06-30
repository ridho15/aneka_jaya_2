import { NextResponse } from "next/server";
import { barangSchema } from "@/lib/validation/barangSchema";
import { createProduct, listProductTableItems, listProductTablePage } from "@/lib/api/products";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { canListProducts } from "@/lib/auth/apiPermissions";
import { productErrorStatus } from "@/lib/api/productErrorStatus";

function numberParam(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function GET(request: Request) {
  if (!canListProducts(await getCurrentRole())) return NextResponse.json({ success: false, message: "Tidak punya akses Stock Barang." }, { status: 403 });
  const url = new URL(request.url);
  const hasPagingQuery = url.searchParams.has("page") || url.searchParams.has("pageSize") || url.searchParams.has("keyword");
  const response = hasPagingQuery
    ? await listProductTablePage({
        page: numberParam(url.searchParams.get("page")),
        pageSize: numberParam(url.searchParams.get("pageSize")),
        keyword: url.searchParams.get("keyword") || undefined
      })
    : await listProductTableItems();
  return NextResponse.json(response, { status: response.success ? 200 : productErrorStatus(response.code) });
}
export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "stock.manage")) return NextResponse.json({ success: false, message: "Tidak punya akses Input Stock Barang." }, { status: 403 });
  const parsed = barangSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  const response = await createProduct(parsed.data);
  return NextResponse.json(response, { status: response.success ? 201 : 502 });
}
