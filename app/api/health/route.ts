import { NextResponse } from "next/server";
import { listProducts } from "@/lib/api/products";
import { getOpenCloudStatus } from "@/lib/opencloud/auth";
import { getCurrentRole } from "@/lib/auth/session";

export async function GET() {
  if ((await getCurrentRole()) !== "OWNER") {
    return NextResponse.json({ status: "ok" });
  }
  const erp = await listProducts();
  const cloud = getOpenCloudStatus();
  return NextResponse.json({
    status: "ok",
    erp: { connected: erp.success, message: erp.success ? "ERP terhubung" : erp.message },
    opencloud: { connected: cloud.configured, message: cloud.message }
  });
}
