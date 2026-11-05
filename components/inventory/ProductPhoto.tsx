"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * Foto kecil barang. Disorot mouse: membesar di tempat. Di HP: ketuk untuk membuka foto penuh.
 * Pengelola Master Barang bisa menambah/ganti foto.
 */
export function ProductPhoto({ productId, sku, photoUrl, canEdit }: { productId: string; sku: string; photoUrl?: string | null; canEdit: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/inventory/products/${encodeURIComponent(productId)}/photo`, { method: "POST", body });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) showToast(json.message || "Foto gagal diunggah.", "error");
      else { showToast(`Foto ${sku} tersimpan.`, "success"); router.refresh(); }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const picker = canEdit && (
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
  );

  if (!photoUrl) {
    if (!canEdit) return <span className="block h-10 w-10 shrink-0 rounded-md bg-slate-100" aria-hidden />;
    return (
      <>
        {picker}
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-[11px] font-semibold leading-tight text-slate-600 hover:border-emerald-500 hover:text-emerald-800" aria-label={`Tambah foto ${sku}`}>
          {busy ? "..." : "+ Foto"}
        </button>
      </>
    );
  }

  return (
    <span className="group relative block h-11 w-11 shrink-0">
      {picker}
      <a href={photoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Lihat foto ${sku}`} className="block h-11 w-11">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={`Foto ${sku}`}
          loading="lazy"
          className="h-11 w-11 origin-top-left rounded-md border border-slate-200 bg-white object-cover transition-transform duration-150 group-hover:relative group-hover:z-30 group-hover:scale-[4] group-hover:shadow-xl"
        />
      </a>
      {canEdit && (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="absolute -bottom-1 -right-1 rounded bg-white/90 px-1 text-[10px] font-semibold text-emerald-800 shadow-sm ring-1 ring-slate-200" aria-label={`Ganti foto ${sku}`}>
          {busy ? "…" : "Ganti"}
        </button>
      )}
    </span>
  );
}
