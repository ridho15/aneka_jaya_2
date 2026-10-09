import { NextResponse } from "next/server";
import { penjualanSchema } from "@/lib/validation/penjualanSchema";
import { createSale } from "@/lib/api/sales";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { MasterDataError } from "@/lib/business/masterData";

export async function POST(request: Request) {
  if (!can(await getCurrentRole(), "penjualan.create")) return NextResponse.json({ success: false, message: "Tidak punya akses Input Penjualan." }, { status: 403 });
  const parsed = penjualanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Mohon lengkapi data yang wajib diisi.", code: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  try {
    const response = await createSale(parsed.data);
    const status = response.success
      ? (response.data && typeof response.data === "object" && "idempotentReplay" in response.data ? 200 : 201)
      : response.code === "DUPLICATE_SUSPECTED" || response.code === "TRANSACTION_IN_FLIGHT"
        ? 409
        : response.code === "VALIDATION_ERROR"
          ? 400
          : 502;
    return NextResponse.json(response, { status });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ success: false, message: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: "Penjualan gagal disimpan.", code: "SALE_CREATE_FAILED" }, { status: 500 });
  }
}
