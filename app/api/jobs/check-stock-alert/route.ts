import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { checkStockAlertJob } from "@/lib/whatsapp/reportScheduler";

export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;
  const data = await checkStockAlertJob();
  return NextResponse.json({ success: true, data });
}
