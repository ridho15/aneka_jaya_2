import "server-only";
import { NextResponse } from "next/server";

export function rejectIfInvalidCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) return NextResponse.json({ success: false, message: "CRON_SECRET tidak valid." }, { status: 401 });
  return null;
}
