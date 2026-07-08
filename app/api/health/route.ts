import { NextResponse } from "next/server";
import { listProducts } from "@/lib/api/products";
import { getOpenCloudStatus } from "@/lib/opencloud/auth";
import { getCurrentRole } from "@/lib/auth/session";
import { checkAppSettingTable } from "@/lib/db/migrationHealth";

export async function GET() {
  if ((await getCurrentRole()) !== "OWNER") {
    return NextResponse.json({ status: "ok" });
  }
  const erp = await listProducts();
  const cloud = getOpenCloudStatus();
  const appSetting = await checkAppSettingTable();
  return NextResponse.json({
    status: "ok",
    erp: { connected: erp.success, message: erp.success ? "ERP terhubung" : erp.message },
    opencloud: { connected: cloud.configured, message: cloud.message },
    database: { appSetting }
  });
}
