import { NextResponse } from "next/server";
import { rejectIfInvalidCron } from "@/lib/jobs/cronAuth";
import { cleanupCctvStorage, CctvCleanupOptions } from "@/lib/cctv/cleanup";

export async function POST(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;

  const url = new URL(request.url);
  const dryRunParam = url.searchParams.get("dryRun");
  let bodyDryRun = false;
  const customRetention: Partial<CctvCleanupOptions> = {};

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (body.dryRun !== undefined) bodyDryRun = Boolean(body.dryRun);
      if (body.normalRetentionDays) customRetention.normalRetentionDays = Number(body.normalRetentionDays);
      if (body.anomalyRetentionDays) customRetention.anomalyRetentionDays = Number(body.anomalyRetentionDays);
      if (body.payloadRetentionDays) customRetention.payloadRetentionDays = Number(body.payloadRetentionDays);
      if (body.fileRetentionDays) customRetention.fileRetentionDays = Number(body.fileRetentionDays);
    }
  } catch {
    // Continue with defaults
  }

  const dryRun = dryRunParam === "true" || dryRunParam === "1" || bodyDryRun;

  try {
    const result = await cleanupCctvStorage({
      dryRun,
      ...customRetention,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("CCTV Storage Cleanup Error:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Gagal membersihkan storage CCTV",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const rejected = rejectIfInvalidCron(request);
  if (rejected) return rejected;

  const url = new URL(request.url);
  const dryRunParam = url.searchParams.get("dryRun");
  const dryRun = dryRunParam === "true" || dryRunParam === "1";

  const customRetention: Partial<CctvCleanupOptions> = {};
  if (url.searchParams.get("normalRetentionDays")) {
    customRetention.normalRetentionDays = Number(url.searchParams.get("normalRetentionDays"));
  }
  if (url.searchParams.get("anomalyRetentionDays")) {
    customRetention.anomalyRetentionDays = Number(url.searchParams.get("anomalyRetentionDays"));
  }
  if (url.searchParams.get("payloadRetentionDays")) {
    customRetention.payloadRetentionDays = Number(url.searchParams.get("payloadRetentionDays"));
  }
  if (url.searchParams.get("fileRetentionDays")) {
    customRetention.fileRetentionDays = Number(url.searchParams.get("fileRetentionDays"));
  }

  try {
    const result = await cleanupCctvStorage({
      dryRun,
      ...customRetention,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("CCTV Storage Cleanup Error:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Gagal membersihkan storage CCTV",
    }, { status: 500 });
  }
}
