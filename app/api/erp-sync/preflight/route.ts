import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getErpSyncPreflight } from "@/lib/erpSync/preflight";

export async function GET() {
  const role = await getCurrentRole();
  if (!can(role, "erp_sync.retry")) return NextResponse.json({ success: false, message: "Tidak punya akses ERP Sync." }, { status: 403 });
  const data = await getErpSyncPreflight();
  return NextResponse.json({ success: true, data });
}
