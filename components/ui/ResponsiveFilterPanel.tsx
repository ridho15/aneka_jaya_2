"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

type ResponsiveFilterPanelProps = {
  title: string;
  resetHref: string;
  children: ReactNode;
  activeFilters?: string[];
  emptyText?: string;
  submitLabel?: string;
  formClassName?: string;
  actionsClassName?: string;
  className?: string;
  surface?: boolean;
};

export function ResponsiveFilterPanel({
  title,
  resetHref,
  children,
  activeFilters = [],
  emptyText = "Filter aktif: semua data.",
  submitLabel = "Filter",
  formClassName = "grid gap-3 md:grid-cols-4",
  actionsClassName = "",
  className = "",
  surface = true
}: ResponsiveFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const activeCount = activeFilters.length;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <section className={`${surface ? "aj-surface" : ""} ${className}`}>
      <div className="p-4 md:hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-sm bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="mobile-filter-panel"
          onClick={() => setOpen(true)}
        >
          <span>{title}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{activeCount > 0 ? `${activeCount} aktif` : "Semua"}</span>
        </button>
        <FilterChips activeFilters={activeFilters} emptyText={emptyText} />
      </div>

      <div className="hidden p-5 md:block">
        <form className={formClassName}>
          {children}
          <FilterActions resetHref={resetHref} submitLabel={submitLabel} className={actionsClassName} />
        </form>
        <FilterChips activeFilters={activeFilters} emptyText={emptyText} />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-labelledby={titleId} id="mobile-filter-panel">
          <button className="absolute inset-0 bg-slate-950/35" type="button" aria-label="Tutup filter lewat overlay" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Filter</p>
                <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-xl leading-none text-slate-600"
                aria-label="Tutup filter"
                onClick={() => setOpen(false)}
              >
                x
              </button>
            </div>
            <form className="max-h-[calc(88vh-73px)] overflow-y-auto p-5" onSubmit={() => setOpen(false)}>
              <div className="grid gap-3">
                {children}
              </div>
              <div className="sticky bottom-0 -mx-5 mt-5 grid gap-2 border-t border-slate-100 bg-white px-5 py-4">
                <button className="rounded-sm bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">{submitLabel}</button>
                <Link className="rounded-sm border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={resetHref} onClick={() => setOpen(false)}>Reset</Link>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterActions({ resetHref, submitLabel, className }: { resetHref: string; submitLabel: string; className: string }) {
  return (
    <div className={`grid gap-2 sm:flex ${className}`}>
      <button className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">{submitLabel}</button>
      <Link className="rounded-sm border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50" href={resetHref}>Reset</Link>
    </div>
  );
}

function FilterChips({ activeFilters, emptyText }: { activeFilters: string[]; emptyText: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {activeFilters.length > 0
        ? activeFilters.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{item}</span>)
        : <span className="text-slate-500">{emptyText}</span>}
    </div>
  );
}
