"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { barangSchema, type BarangInput } from "@/lib/validation/barangSchema";
import type { Product } from "@/lib/types/product";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BarangForm({ product }: { product?: Product }) {
  const router = useRouter(); const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<BarangInput>({ resolver: zodResolver(barangSchema), defaultValues: product ? { code: product.code, name: product.name, category: product.category ?? "", unit: product.unit ?? "PCS", sellingPrice: product.sellingPrice ?? 0, costPrice: product.costPrice ?? 0, brand: product.brand || "", initialStock: product.initialStock ?? 0, minimumStock: product.minimumStock ?? 0, warehouse: product.warehouse || "Toko", rack: product.rack || "", isActive: product.isActive ?? true, notes: product.notes || "" } : { unit: "PCS", sellingPrice: 0, costPrice: 0, initialStock: 0, minimumStock: 0, warehouse: "Toko", isActive: true } });
  const sellingPrice = watch("sellingPrice");
  const costPrice = watch("costPrice");
  const submit = async (data: BarangInput) => {
    setNotice(undefined); const response = await fetch(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json();
    if (!response.ok || !result.success) { setNotice({ type: "error", message: result.message || "Data gagal dikirim ke ERP." }); return; }
    setNotice({ type: "success", message: product ? "Data barang berhasil diperbarui." : "Data barang berhasil disimpan." });
    setTimeout(() => router.push("/barang"), 600);
  };
  return <form onSubmit={handleSubmit(submit)} className="space-y-6">{notice && <Toast {...notice} />}<p className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">Tujuan ERP: data barang dan <b>stok awal</b> akan ditambahkan ke gudang <b>{product?.warehouse || "Toko"}</b>.</p><section className="aj-surface p-5 sm:p-6"><div className="grid gap-5 md:grid-cols-2">
    <Field label="Kode barang" error={errors.code?.message}><Input {...register("code")} /></Field><Field label="Nama barang" error={errors.name?.message}><Input {...register("name")} /></Field>
    <Field label="Kategori" error={errors.category?.message}><Input placeholder="Contoh: Aksesoris" {...register("category")} /></Field><Field label="Satuan" error={errors.unit?.message}><Select {...register("unit")}><option>PCS</option><option>BOX</option><option>PACK</option><option>SET</option><option>UNIT</option></Select></Field>
    <Field label="Harga jual" error={errors.sellingPrice?.message}><MoneyInput value={sellingPrice} min={0} onValueChange={(value) => setValue("sellingPrice", value, { shouldDirty: true, shouldValidate: true })} /></Field><Field label="Harga modal" error={errors.costPrice?.message}><MoneyInput value={costPrice} min={0} onValueChange={(value) => setValue("costPrice", value, { shouldDirty: true, shouldValidate: true })} /></Field>
    <Field label="Merk"><Input {...register("brand")} /></Field><Field label="Stok awal"><Input type="number" min="0" {...register("initialStock", { valueAsNumber: true })} /></Field>
    <Field label="Minimum stock"><Input type="number" min="0" {...register("minimumStock", { valueAsNumber: true })} /></Field>
    <Field label="Gudang"><Input placeholder="Toko" {...register("warehouse")} /></Field><Field label="Rak"><Input placeholder="Contoh: A1" {...register("rack")} /></Field>
    <div className="md:col-span-2"><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><Input type="checkbox" className="h-4 w-4" {...register("isActive")} /> Barang aktif</label></div>
    <div className="md:col-span-2"><Field label="Catatan"><Textarea rows={3} placeholder="Opsional" {...register("notes")} /></Field></div>
  </div></section><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => router.push("/barang")}>Batal</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : product ? "Simpan Perubahan" : "Simpan Barang"}</Button></div></form>;
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>; }
