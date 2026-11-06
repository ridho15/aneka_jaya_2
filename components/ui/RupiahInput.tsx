"use client";

/** Input rupiah dengan pemisah ribuan langsung saat mengetik (mis. Rp 3.500.000). Nilai yang dikirim: angka saja. */
export function RupiahInput({ value, onChange, placeholder, id, className = "", ariaLabel }: {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const shown = value ? Number(value).toLocaleString("id-ID") : "";
  return (
    <div className={`flex min-h-11 items-center rounded-lg border border-slate-300 bg-white focus-within:border-emerald-600 ${className}`}>
      <span className="pl-3 text-sm font-semibold text-slate-500">Rp</span>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-right text-sm tabular-nums outline-none"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13))}
      />
      <span className="pr-3 text-xs font-semibold text-slate-500">IDR</span>
    </div>
  );
}
