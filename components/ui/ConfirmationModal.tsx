"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ConfirmationModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  message?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
  confirmDisabled?: boolean;
};

export function ConfirmationModal({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  message,
  children,
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  variant = "primary",
  isLoading = false,
  confirmDisabled = false
}: ConfirmationModalProps) {
  const [mounted, setMounted] = useState(false);

  const handleClose = () => {
    if (onClose) onClose();
    else if (onCancel) onCancel();
  };

  const resolvedDescription = description ?? message;
  const resolvedConfirmLabel = confirmText ?? confirmLabel ?? "Konfirmasi";
  const resolvedCancelLabel = cancelText ?? cancelLabel ?? "Batal";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose, onCancel]);

  if (!mounted || !isOpen) return null;

  const isDanger = variant === "danger";
  const isWarning = variant === "warning";

  const badgeText = isDanger ? "Tindakan Penting" : isWarning ? "Perhatian" : "Konfirmasi";
  const badgeClass = isDanger
    ? "text-rose-600 bg-rose-50 border-rose-200"
    : isWarning
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-emerald-700 bg-emerald-50 border-emerald-200";

  const confirmBtnClass = isDanger
    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
    : isWarning
    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20"
    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm transition-opacity duration-150"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          handleClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 transition-all duration-150 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}
            >
              {badgeText}
            </span>
            <h3
              id="confirmation-dialog-title"
              className="mt-1.5 text-lg font-bold tracking-tight text-slate-900"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Tutup dialog"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {resolvedDescription && (
          <div className="text-sm text-slate-600 leading-relaxed break-words">
            {resolvedDescription}
          </div>
        )}

        {children && <div className="space-y-3">{children}</div>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${confirmBtnClass}`}
          >
            {isLoading && (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            <span>{isLoading ? "Memproses..." : resolvedConfirmLabel}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
