"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  showToast: (
    messageOrToast: string | Omit<ToastItem, "id">,
    type?: ToastType,
    duration?: number
  ) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      removeToast: () => {}
    };
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      messageOrToast: string | Omit<ToastItem, "id">,
      type: ToastType = "info",
      duration = 4000
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const toastData: ToastItem =
        typeof messageOrToast === "string"
          ? { id, message: messageOrToast, type, duration }
          : { id, ...messageOrToast, duration: messageOrToast.duration ?? 4000 };

      setToasts((prev) => [...prev, toastData]);

      if (toastData.duration && toastData.duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, toastData.duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Floating Toast Notification Container */}
      <div
        aria-live="polite"
        className="fixed top-5 right-5 z-[130] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";
          const isWarning = toast.type === "warning";

          const bgClass = isSuccess
            ? "bg-white border-emerald-300 text-slate-800 shadow-emerald-500/10"
            : isError
            ? "bg-white border-rose-300 text-slate-800 shadow-rose-500/10"
            : isWarning
            ? "bg-white border-amber-300 text-slate-800 shadow-amber-500/10"
            : "bg-white border-blue-300 text-slate-800 shadow-blue-500/10";

          const iconBg = isSuccess
            ? "bg-emerald-100 text-emerald-700"
            : isError
            ? "bg-rose-100 text-rose-700"
            : isWarning
            ? "bg-amber-100 text-amber-700"
            : "bg-blue-100 text-blue-700";

          const icon = isSuccess ? "✓" : isError ? "✕" : isWarning ? "⚠" : "ℹ";

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${bgClass}`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${iconBg}`}
              >
                {icon}
              </span>
              <div className="flex-1 text-xs font-medium leading-relaxed">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-700 p-0.5 text-sm font-bold leading-none cursor-pointer"
                aria-label="Tutup notifikasi"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
