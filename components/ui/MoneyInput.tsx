"use client";

import { Input } from "@/components/ui/Input";
import type { InputHTMLAttributes } from "react";

export function parseMoneyInput(value: string): number {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const number = Number(digits);
  return Number.isFinite(number) ? number : 0;
}

export function formatMoneyInput(value: number | null | undefined): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return Math.trunc(number).toLocaleString("id-ID");
}

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
};

export function MoneyInput({ value, onValueChange, onBlur, ...props }: MoneyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatMoneyInput(value)}
      onChange={(event) => onValueChange(parseMoneyInput(event.target.value))}
      onBlur={onBlur}
    />
  );
}
