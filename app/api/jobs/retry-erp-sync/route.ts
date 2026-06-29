import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { recordAudit } from "@/lib/audit/store";

export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;
  await recordAudit({ entityType: "erp_sync", entityId: `retry-${Date.now()}`, action: "retry_sync", reason: "Retry ERP sync job route dipanggil" });
  return NextResponse.json({ success: true, data: { retried: true } });
}
