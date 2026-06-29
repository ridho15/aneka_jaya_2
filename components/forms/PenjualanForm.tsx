"use client";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { penjualanSchema, type PenjualanInput } from "@/lib/validation/penjualanSchema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types/product";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";

const draftKey = "aneka-jaya-draft-penjualan";
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const today = new Date().toISOString().slice(0, 10);

type Props = { tipes: BookkeepingType[]; rekenings: RekeningAccount[] };
type CreatedSale = { id: string; approvalStatus?: string };

export function PenjualanForm({ tipes, rekenings }: Props) {
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = useMemo(() => activeTipes[0] ?? { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 }, [activeTipes]);
  const rekeningForTipe = useCallback((selectedTipeId: string) => rekenings.filter((r) => r.tipeIds.includes(selectedTipeId)), [rekenings]);
  const defaultRekening = useMemo(() => rekeningForTipe(defaultTipe.id)[0], [defaultTipe.id, rekeningForTipe]);

  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [createdSale, setCreatedSale] = useState<CreatedSale>();
  const [products, setProducts] = useState<Product[]>([]);
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<PenjualanInput>({
    resolver: zodResolver(penjualanSchema),
    defaultValues: {
      saleDate: today, tipeId: defaultTipe.id, tipeCodeSnapshot: defaultTipe.code, tipeNameSnapshot: defaultTipe.name,
      rekeningId: defaultRekening?.id || "", rekeningNameSnapshot: defaultRekening?.name || "",
      customerName: "Walk In", customerLocation: "Toko", shippingMethod: "di Tempat", paymentMethod: "Cash",
      items: [{ productRef: "", quantity: 1, unitPrice: 0, discount: 0 }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = watch("items");
  const paymentMethod = watch("paymentMethod");
  const tipeId = watch("tipeId");
  const total = values.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0)), 0);
  const subtotal = values.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const discountTotal = values.reduce((sum, item) => sum + Number(item.discount || 0), 0);

  const addItem = () => {
    const newIndex = fields.length;
    append({ productRef: "", quantity: 1, unitPrice: 0, discount: 0 });
    window.setTimeout(() => document.getElementById(`sale-item-${newIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  useEffect(() => {
    const refreshProducts = async () => {
      const response = await fetch("/api/products", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) setProducts(result.data);
    };
    refreshProducts();
    const interval = window.setInterval(refreshProducts, 30_000);
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try { reset(JSON.parse(saved)); setNotice({ type: "error", message: "Draf yang belum terkirim telah dipulihkan." }); }
      catch { localStorage.removeItem(draftKey); }
    }
    return () => window.clearInterval(interval);
  }, [reset]);

  useEffect(() => {
    const tipe = activeTipes.find((t) => t.id === tipeId) ?? activeTipes[0];
    if (!tipe) return;
    setValue("tipeCodeSnapshot", tipe.code);
    setValue("tipeNameSnapshot", tipe.name);
    const reks = rekeningForTipe(tipe.id);
    const first = reks[0];
    if (first) { setValue("rekeningId", first.id); setValue("rekeningNameSnapshot", first.name); }
  }, [activeTipes, rekeningForTipe, setValue, tipeId]);

  const submit = async (data: PenjualanInput) => {
    setNotice(undefined);
    setCreatedSale(undefined);
    const response = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok || !result.success) {
      localStorage.setItem(draftKey, JSON.stringify(data));
      setNotice({ type: "error", message: result.message || "Data gagal dikirim ke ERP. Draf disimpan di perangkat ini." });
      return;
    }
    localStorage.removeItem(draftKey);
    if (result.data?.id) setCreatedSale({ id: String(result.data.id), approvalStatus: result.data.approvalStatus });
    const defaultRek = rekeningForTipe(defaultTipe.id)[0];
    reset({ saleDate: today, tipeId: defaultTipe.id, tipeCodeSnapshot: defaultTipe.code, tipeNameSnapshot: defaultTipe.name, rekeningId: defaultRek?.id || "", rekeningNameSnapshot: defaultRek?.name || "", customerName: "Walk In", customerLocation: "Toko", shippingMethod: "di Tempat", paymentMethod: "Cash", items: [{ productRef: "", quantity: 1, unitPrice: 0, discount: 0 }] });
    setNotice({ type: "success", message: result.data?.approvalStatus === "pending_approval" ? "Data berhasil disimpan dan menunggu approval." : "Data penjualan berhasil disimpan." });
  };

  const filteredRekenings = useMemo(() => rekeningForTipe(tipeId), [rekeningForTipe, tipeId]);

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {notice && <Toast {...notice} />}
      {createdSale && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {createdSale.approvalStatus === "approved" ? (
            <Link href={`/print/sales/${createdSale.id}`} className="font-bold underline underline-offset-4">
              Cetak Penjualan
            </Link>
          ) : (
            <span>Cetak final tersedia setelah approval.</span>
          )}
        </div>
      )}
      <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Tujuan ERP: transaksi ini akan dibuat sebagai <b>Invoice Penjualan</b>.</p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="aj-surface overflow-hidden">
            <div className="border-b border-neutral-200 px-5 py-4 sm:px-6"><h2 className="text-base font-bold tracking-tight">Informasi customer</h2></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
              <Field label="Tanggal penjualan" error={errors.saleDate?.message}><Input type="date" {...register("saleDate")} /></Field>
              <Field label="Tipe" error={errors.tipeId?.message}>
                <Select {...register("tipeId")}>
                  {activeTipes.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
                </Select>
              </Field>
              <Field label="Nama customer" error={errors.customerName?.message}><Input placeholder="Walk In" {...register("customerName")} /></Field>
              <Field label="Lokasi customer"><Input placeholder="Toko" {...register("customerLocation")} /></Field>
              <Field label="Ekspedisi"><Input placeholder="di Tempat" {...register("shippingMethod")} /></Field>
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-slate-700">Status Pembayaran</p>
                <div className="inline-flex flex-wrap border border-neutral-300 bg-white">
                  {["Cash", "TF", "Tempo", "Other"].map((method, i) => (
                    <label key={method} className={`cursor-pointer${i > 0 ? " border-l border-neutral-300" : ""}`}>
                      <input className="peer sr-only" type="radio" value={method} {...register("paymentMethod")} />
                      <span className={`block min-w-24 px-5 py-2 text-center text-sm font-semibold text-neutral-600 ${method === "Cash" ? "peer-checked:bg-neutral-950 peer-checked:text-white" : method === "TF" ? "peer-checked:bg-blue-600 peer-checked:text-white" : method === "Tempo" ? "peer-checked:bg-fuchsia-600 peer-checked:text-white" : "peer-checked:bg-amber-500 peer-checked:text-white"}`}>{method}</span>
                    </label>
                  ))}
                </div>
                {errors.paymentMethod?.message && <span className="mt-1 block text-xs text-red-600">{errors.paymentMethod.message}</span>}
              </div>
              {paymentMethod !== "Tempo" && (
                <Field label="Rekening penerima" error={errors.rekeningId?.message}>
                  <Select {...register("rekeningId")} onChange={(event) => { const label = event.currentTarget.selectedOptions[0]?.text || ""; setValue("rekeningId", event.target.value); setValue("rekeningNameSnapshot", label); }}>
                    {filteredRekenings.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    {filteredRekenings.length === 0 && <option value="">— tidak ada rekening untuk tipe ini —</option>}
                  </Select>
                  {filteredRekenings.length === 0 && <span className="mt-1 block text-xs font-normal text-amber-700">Belum ada rekening untuk tipe ini. Tambah di Pengaturan → Rekening.</span>}
                </Field>
              )}
              {paymentMethod === "Tempo" && <Field label="Tanggal Jatuh Tempo" error={errors.dueDate?.message}><Input type="date" {...register("dueDate")} /></Field>}
              <Field label="Tanggal kirim"><Input type="date" {...register("deliveryDate")} /></Field>
              <div className="sm:col-span-2"><Field label="Catatan"><Textarea rows={1} placeholder="Opsional" {...register("notes")} /></Field></div>
            </div>
          </section>
          <section className="aj-surface overflow-hidden">
            <div className="sticky top-2 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div><h2 className="text-base font-bold tracking-tight">Barang</h2><p className="mt-0.5 text-xs text-neutral-500">{fields.length} item</p></div>
              <Button type="button" variant="secondary" onClick={addItem}>+ Tambah barang</Button>
            </div>
            <div className="hidden grid-cols-[minmax(0,2fr)_78px_120px_100px_120px] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500 md:grid sm:px-6"><span>Barang</span><span>Qty</span><span>Harga satuan</span><span>Diskon</span><span>Subtotal</span></div>
            <div className="divide-y divide-neutral-200">
              {fields.map((field, index) => (
                <div id={`sale-item-${index}`} key={field.id} className="scroll-mt-24 p-5 sm:p-6">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_78px_120px_100px_120px]">
                    <Field label="Barang" error={errors.items?.[index]?.productRef?.message}><Input list="erp-products" placeholder="Kode / nama barang" {...register(`items.${index}.productRef`)} /></Field>
                    <Field label="Qty" error={errors.items?.[index]?.quantity?.message}><Input type="number" min="1" step="1" {...register(`items.${index}.quantity`, { valueAsNumber: true })} /></Field>
                    <Field label="Harga" error={errors.items?.[index]?.unitPrice?.message}><Input type="number" min="0" {...register(`items.${index}.unitPrice`, { valueAsNumber: true })} /></Field>
                    <Field label="Diskon"><Input type="number" min="0" {...register(`items.${index}.discount`, { valueAsNumber: true })} /></Field>
                    <div><p className="mb-1 text-sm font-medium text-slate-700">Subtotal</p><p className="border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-semibold">{rupiah(Number(values[index]?.quantity || 0) * Number(values[index]?.unitPrice || 0) - Number(values[index]?.discount || 0))}</p></div>
                  </div>
                  {fields.length > 1 && <button type="button" onClick={() => remove(index)} className="mt-3 text-xs font-semibold text-red-600">Hapus barang</button>}
                </div>
              ))}
            </div>
            {errors.items?.root?.message && <p className="px-5 py-3 text-sm text-red-600">{errors.items.root.message}</p>}
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="aj-surface p-5">
            <h2 className="text-base font-bold tracking-tight">Ringkasan penjualan</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-neutral-500">Subtotal</dt><dd>{rupiah(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Diskon</dt><dd>{rupiah(discountTotal)}</dd></div>
              <div className="border-t border-neutral-300 pt-4"><dt className="text-sm font-semibold">Total</dt><dd className="mt-1 text-3xl font-bold tracking-tight">{rupiah(total)}</dd></div>
            </dl>
            <Button type="submit" className="mt-6 w-full" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Penjualan"}</Button>
          </section>
        </aside>
      </div>
      <datalist id="erp-products">{products.map((product) => <option key={product.id} value={product.code}>{product.name}</option>)}</datalist>
      <p className="flex items-center gap-2 text-xs text-neutral-500"><span className="grid h-4 w-4 place-items-center rounded-full border border-neutral-400 text-[10px]">i</span> Data barang ditarik dari ERP dan diperbarui tiap 30 detik. Pastikan data penjualan sudah benar sebelum disimpan.</p>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>;
}
