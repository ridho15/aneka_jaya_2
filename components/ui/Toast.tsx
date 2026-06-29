"use client";
export function Toast({ type, message }: { type: "success" | "error"; message: string }) {
  return <div role="status" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message}</div>;
}
