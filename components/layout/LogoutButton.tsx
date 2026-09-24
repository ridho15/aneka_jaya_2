"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export function LogoutButton({ className = "", label = "Logout" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  async function executeLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsConfirmOpen(true)}
        disabled={loggingOut}
        className={`inline-flex border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${className}`}
      >
        {loggingOut ? "Keluar..." : label}
      </button>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        title="Konfirmasi Logout"
        message="Apakah Anda yakin ingin mengakhiri sesi dan keluar dari aplikasi SLM?"
        confirmLabel="Ya, Keluar"
        cancelLabel="Batal"
        variant="warning"
        isLoading={loggingOut}
        onConfirm={executeLogout}
        onCancel={() => {
          if (!loggingOut) setIsConfirmOpen(false);
        }}
      />
    </>
  );
}
