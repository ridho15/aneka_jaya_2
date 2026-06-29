import type { ButtonHTMLAttributes } from "react";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = { primary: "bg-neutral-900 text-white hover:bg-neutral-700", secondary: "bg-white text-neutral-700 border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50", danger: "bg-red-600 text-white hover:bg-red-700" };
  return <button className={`inline-flex min-h-9 items-center justify-center rounded-sm px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`} {...props} />;
}
