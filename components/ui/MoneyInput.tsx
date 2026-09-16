"use client";

import { Input } from "@/components/ui/Input";
import { type InputHTMLAttributes, useEffect, useState } from "react";

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

export function MoneyInput({ value, onValueChange, onFocus, onBlur, ...props }: MoneyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState(() =>
    value && Number(value) > 0 ? String(Math.trunc(Number(value))) : "",
  );

  useEffect(() => {
    if (!isFocused) {
      setLocalText(
        value && Number(value) > 0 ? String(Math.trunc(Number(value))) : "",
      );
    }
  }, [value, isFocused]);

  const displayValue = isFocused ? localText : formatMoneyInput(value);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true);
        setLocalText(
          value && Number(value) > 0 ? String(Math.trunc(Number(value))) : "",
        );
        onFocus?.(event);
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, "");
        setLocalText(digits);
        const numeric = Number(digits) || 0;
        onValueChange(numeric);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        const numeric = Number(localText.replace(/[^\d]/g, "")) || 0;
        onValueChange(numeric);
        onBlur?.(event);
      }}
    />
  );
}
