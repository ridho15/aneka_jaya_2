"use client";

export function Toast({
  type,
  message,
  onClose
}: {
  type: "success" | "error" | "info" | "warning";
  message: string;
  onClose?: () => void;
}) {
  const isSuccess = type === "success";
  const isError = type === "error";
  const isWarning = type === "warning";

  const colorClasses = isSuccess
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : isError
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : isWarning
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-blue-200 bg-blue-50 text-blue-800";

  const iconBg = isSuccess
    ? "bg-emerald-200/60 text-emerald-800"
    : isError
    ? "bg-rose-200/60 text-rose-800"
    : isWarning
    ? "bg-amber-200/60 text-amber-800"
    : "bg-blue-200/60 text-blue-800";

  const icon = isSuccess ? "✓" : isError ? "✕" : isWarning ? "⚠" : "ℹ";

  return (
    <div
      role="status"
      className={`mb-5 flex items-start gap-3 rounded-xl border p-3.5 text-sm font-medium ${colorClasses}`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${iconBg}`}>
        {icon}
      </span>
      <div className="flex-1 text-xs leading-relaxed">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold leading-none cursor-pointer"
          aria-label="Tutup notifikasi"
        >
          ✕
        </button>
      )}
    </div>
  );
}
