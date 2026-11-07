import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Placeholder dari .env.example tidak pernah dianggap secret yang sah.
const PLACEHOLDER_SECRETS = new Set(["change-me", "changeme"]);

export function rejectIfInvalidCron(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const provided = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  const valid = Boolean(secret) && !PLACEHOLDER_SECRETS.has(secret.toLowerCase()) && a.length === b.length && timingSafeEqual(a, b);
  if (!valid) return NextResponse.json({ success: false, message: "CRON_SECRET tidak valid." }, { status: 401 });
  return null;
}
