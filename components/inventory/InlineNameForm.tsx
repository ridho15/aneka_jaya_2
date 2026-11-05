"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

/** Isi nama barang langsung dari tabel stok; Enter untuk menyimpan. */
export function InlineNameForm({ productId, sku }: { productId: string; sku: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/products/${encodeURIComponent(productId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value }) });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) showToast(json.message || "Nama gagal disimpan.", "error");
      else { showToast(`Nama ${sku} tersimpan.`, "success"); router.refresh(); }
    } catch {
      showToast("Koneksi terputus. Coba lagi.", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="mt-1 flex items-center gap-1.5">
      <input
        aria-label={`Nama barang ${sku}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ketik nama barang"
        maxLength={255}
        className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      />
      <button type="submit" disabled={busy || !name.trim()} className="min-h-11 shrink-0 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {busy ? "..." : "Simpan"}
      </button>
    </form>
  );
}
