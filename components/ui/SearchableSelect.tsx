"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  badge?: string;
  description?: string;
  disabled?: boolean;
};

export type SearchableSelectProps = {
  options: SearchableSelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  buttonClassName?: string;
  emptyText?: string;
  align?: "left" | "right";
};

export function SearchableSelect({
  options,
  onSelect,
  placeholder = "+ Pilih Opsi",
  searchPlaceholder = "Cari opsi...",
  disabled = false,
  isLoading = false,
  className = "",
  buttonClassName = "",
  emptyText = "Tidak ada hasil yang cocok",
  align = "left"
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchBadge = opt.badge ? opt.badge.toLowerCase().includes(q) : false;
      const matchDesc = opt.description ? opt.description.toLowerCase().includes(q) : false;
      return matchLabel || matchBadge || matchDesc;
    });
  }, [options, searchQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled || isLoading) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelectOption = (value: string) => {
    onSelect(value);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${buttonClassName}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {isLoading ? (
            <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
          <span className="truncate">{placeholder}</span>
        </span>
        <svg
          className={`w-3 h-3 shrink-0 text-slate-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-64 sm:w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-950/5 transition-all duration-150 ease-out ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Search Input Bar */}
          <div className="relative mb-2">
            <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 overscroll-contain">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelectOption(opt.value)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <div className="truncate">
                    <span className="font-semibold text-slate-900">{opt.label}</span>
                    {opt.description && (
                      <p className="text-[10px] text-slate-400 truncate">{opt.description}</p>
                    )}
                  </div>
                  {opt.badge && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="py-4 text-center text-xs text-slate-400 italic">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
