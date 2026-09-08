"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
      const result = await response.json();
      if (!result.success) {
        setMessage(result.message || "Login gagal.");
        return;
      }
      router.push(result.data?.redirectTo || "/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className={`space-y-4 ${className}`}>
      <label className="block text-sm font-semibold text-neutral-800">
        <span className="mb-1.5 block">Email atau username</span>
        <Input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Username atau email" className="min-h-12 border-neutral-300 bg-white px-3.5" required />
      </label>
      <label className="block text-sm font-semibold text-neutral-800">
        <span className="mb-1.5 block">Password</span>
        <Input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" className="min-h-12 border-neutral-300 bg-white px-3.5" required />
      </label>
      {message ? <p aria-live="polite" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{message}</p> : null}
      <Button type="submit" className="min-h-12 w-full rounded-sm" disabled={loading}>
        {loading ? "Memeriksa..." : "Masuk ke Sistem"}
      </Button>
    </form>
  );
}
