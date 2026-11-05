"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/Input";

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  shippingMethod: string | null;
  orderCount: number;
};

/** Nama customer dengan saran dari customer yang pernah belanja; memilih mengisi HP, lokasi, dan ekspedisi. */
export function CustomerNameInput({ registration, value, onPick }: { registration: UseFormRegisterReturn; value: string; onPick: (customer: CustomerOption) => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const q = query.trim().toLowerCase() === "walk in" ? "" : query;
      fetch(`/api/customers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => {
          setOptions(json.success ? json.data : []);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (customer: CustomerOption) => {
    onPick(customer);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        {...registration}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Ketik nama atau No. HP"
        onFocus={(event) => {
          if (event.currentTarget.value.trim().toLowerCase() === "walk in") event.currentTarget.select();
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onChange={(event) => {
          void registration.onChange(event);
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || !options.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (event.key === "Enter" && active >= 0) { event.preventDefault(); pick(options[active]); }
          else if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[18rem] overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {options.map((c, index) => {
            const same = c.name.trim().toLowerCase() === value.trim().toLowerCase();
            return (
              <li key={c.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(c)}
                  className={`block min-h-11 w-full px-3 py-2 text-left ${index === active ? "bg-emerald-50" : "hover:bg-neutral-50"}`}
                >
                  <span className="block text-sm font-semibold text-slate-900">{c.name}{same && <span className="ml-1.5 text-xs font-normal text-emerald-800">dipilih</span>}</span>
                  <span className="block truncate text-xs text-slate-600">
                    {[c.phone, c.location, c.shippingMethod].filter(Boolean).join(" · ") || "Belum ada HP/lokasi"} · {c.orderCount}x belanja
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
