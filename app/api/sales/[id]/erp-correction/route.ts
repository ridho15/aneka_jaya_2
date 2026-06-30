import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { pendingErpContractResponse } from "@/lib/api/erpContractGuards";

export async function POST() {
  if (!can(await getCurrentRole(), "penjualan.manage")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses koreksi ERP Penjualan." }, { status: 403 });
  }
  return NextResponse.json(pendingErpContractResponse("sales_correction"), { status: 501 });
}
