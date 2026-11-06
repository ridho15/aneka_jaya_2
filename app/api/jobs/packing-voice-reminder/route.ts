import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { runPackingVoiceReminder } from "@/lib/cctv/packingVoice";

// Dipanggil cron tiap jam (lihat docs/pengingat-suara-packing.md).
export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;
  const data = await runPackingVoiceReminder(new Date());
  return NextResponse.json({ success: true, data });
}
