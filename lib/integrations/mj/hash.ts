import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function immutablePayloadHash(value: unknown) {
  return sha256(JSON.stringify(canonical(value)));
}
