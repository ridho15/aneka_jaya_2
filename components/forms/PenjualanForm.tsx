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
import type { StockItem } from "@/lib/types/stock";
import type { Sale } from "@/lib/types/sales";
import type { BookkeepingType, RekeningAccount } from "@/lib/business/masterData";
import { APP_BRAND_NAME, EXTERNAL_ERP_NAME } from "@/lib/appBrand";
import { useRouter } from "next/navigation";

const draftKey = "aneka-jaya-draft-penjualan";
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const today = new Date().toISOString().slice(0, 10);

type Props = { tipes: BookkeepingType[]; rekenings: RekeningAccount[]; allowTestTransaction?: boolean; erpTypeCodes?: string[]; sale?: Sale };
type CreatedSale = { id: string; approvalStatus?: string; target?: "erp" | "local"; testReference?: string; erpReference?: string };
type ProductState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "empty"; message: string }
  | { status: "error"; message: string; code?: string };
type StockState =
  | { status: "loading" }
  | { status: "success"; updatedAt: string }
  | { status: "failed"; message: string };
type ProductOption = {
  product: Product;
  stockRows: StockItem[];
  quantity: number | null;
  minimumStock: number | null;
  unit: string | null;
  warehouses: string[];
  warnings: string[];
};

const normalizeCode = (value?: string | null) => String(value ?? "").trim().toLowerCase();

export function PenjualanForm({ tipes, rekenings, allowTestTransaction = false, erpTypeCodes = ["AJ"], sale }: Props) {
  const router = useRouter();
  const isEdit = Boolean(sale);
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = sale ? activeTipes.find((tipe) => tipe.id === sale.tipeId || tipe.code === sale.tipeCodeSnapshot) || activeTipes[0] : activeTipes[0];
  const rekeningForTipe = useCallback((selectedTipeId: string) => rekenings.filter((r) => r.tipeIds.includes(selectedTipeId)), [rekenings]);
  const defaultRekening = useMemo(() => sale?.rekeningId ? rekenings.find((rekening) => rekening.id === sale.rekeningId) : defaultTipe ? rekeningForTipe(defaultTipe.id)[0] : undefined, [defaultTipe, rekeningForTipe, rekenings, sale?.rekeningId]);

  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string }>();
  const [createdSale, setCreatedSale] = useState<CreatedSale>();
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [productState, setProductState] = useState<ProductState>({ status: "loading" });
  const [stockState, setStockState] = useState<StockState>({ status: "loading" });
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<PenjualanInput>({
    resolver: zodResolver(penjualanSchema),
    defaultValues: {
      saleDate: sale?.saleDate || today, tipeId: sale?.tipeId || defaultTipe?.id || "", tipeCodeSnapshot: sale?.tipeCodeSnapshot || defaultTipe?.code || "", tipeNameSnapshot: sale?.tipeNameSnapshot || defaultTipe?.name || "",
      rekeningId: defaultRekening?.id || "", rekeningNameSnapshot: defaultRekening?.name || "",
      customerName: sale?.customerName || "Walk In", customerLocation: sale?.customerLocation || "Toko", shippingMethod: sale?.shippingMethod || "di Tempat", paymentMethod: sale?.paymentMethod || "Cash",
      dueDate: sale?.dueDate,
      transferAccount: sale?.transferAccount,
      notes: sale?.notes,
      items: sale?.items?.length ? sale.items.map((item) => ({ productRef: item.productRef, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount || 0 })) : [{ productRef: "", quantity: 1, unitPrice: 0, discount: 0 }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = watch("items");
  const paymentMethod = watch("paymentMethod");
  const tipeId = watch("tipeId");
  const selectedTipe = activeTipes.find((tipe) => tipe.id === tipeId);
  const targetsErp = Boolean(selectedTipe && erpTypeCodes.includes(selectedTipe.code.toUpperCase()));
  const total = values.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0)), 0);
  const subtotal = values.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const discountTotal = values.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const filteredRekenings = useMemo(() => rekeningForTipe(tipeId), [rekeningForTipe, tipeId]);
  const masterDataReady = activeTipes.length > 0 && (paymentMethod === "Tempo" || paymentMethod === "Other" || filteredRekenings.length > 0);
  const productOptions = useMemo(() => buildProductOptions(products, stocks), [products, stocks]);
  const productCodes = useMemo(() => new Set(productOptions.map((option) => normalizeCode(option.product.code))), [productOptions]);
  const selectedProductsReady = values.length > 0 && values.every((item) => productCodes.has(normalizeCode(item.productRef)));
  const dependenciesReady = productState.status === "ready" && masterDataReady;

  const addItem = () => {
    const newIndex = fields.length;
    append({ productRef: "", quantity: 1, unitPrice: 0, discount: 0 });
    window.setTimeout(() => document.getElementById(`sale-item-${newIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const refreshProducts = useCallback(async () => {
    setProductState({ status: "loading" });
    setStockState({ status: "loading" });
    try {
      const [productResponse, stockResponse] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/stocks", { cache: "no-store" })
      ]);
      const productResult = await productResponse.json().catch(() => null);
      if (!productResponse.ok || !productResult?.success) {
        setProducts([]);
        setStocks([]);
        setProductState({ status: "error", message: productResult?.message || "Produk ERP gagal dimuat.", code: productResult?.code });
        setStockState({ status: "failed", message: "Stok ERP tidak berhasil dimuat karena daftar barang belum siap." });
        return;
      }
      const rows = Array.isArray(productResult.data) ? productResult.data : [];
      setProducts(rows);
      setProductState(rows.length > 0 ? { status: "ready" } : { status: "empty", message: "ERP belum memiliki produk aktif untuk dipilih." });
      const stockResult = await stockResponse.json().catch(() => null);
      if (stockResponse.ok && stockResult?.success && Array.isArray(stockResult.data)) {
        setStocks(stockResult.data);
        setStockState({ status: "success", updatedAt: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) });
      } else {
        setStocks([]);
        setStockState({ status: "failed", message: stockResult?.message || "Stok ERP tidak berhasil dimuat. Pilih barang tanpa memakai angka stok palsu." });
      }
    } catch {
      setProducts([]);
      setStocks([]);
      setProductState({ status: "error", message: "Koneksi ke layanan produk bermasalah." });
      setStockState({ status: "failed", message: "Koneksi ke layanan stok bermasalah." });
    }
  }, []);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    if (isEdit) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try { reset(JSON.parse(saved)); setNotice({ type: "error", message: "Draf yang belum terkirim telah dipulihkan." }); }
      catch { localStorage.removeItem(draftKey); }
    }
  }, [isEdit, reset]);

  useEffect(() => {
    const tipe = activeTipes.find((t) => t.id === tipeId) ?? activeTipes[0];
    if (!tipe) return;
    setValue("tipeCodeSnapshot", tipe.code);
    setValue("tipeNameSnapshot", tipe.name);
    const reks = rekeningForTipe(tipe.id);
    const first = reks[0];
    setValue("rekeningId", first?.id || "");
    setValue("rekeningNameSnapshot", first?.name || "");
  }, [activeTipes, rekeningForTipe, setValue, tipeId]);

  const submit = async (data: PenjualanInput) => {
    setNotice(undefined);
    setCreatedSale(undefined);
    if (!dependenciesReady) {
      setNotice({ type: "error", message: "Form belum siap. Pastikan produk, tipe pembukuan, dan rekening telah tersedia." });
      return;
    }
    if (!selectedProductsReady) {
      setNotice({ type: "error", message: "Pilih barang dari daftar ERP. Barang tidak boleh diketik bebas." });
      return;
    }
    const response = await fetch(isEdit && sale ? `/api/sales/${encodeURIComponent(sale.id)}` : "/api/sales", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok || !result.success) {
      if (!isEdit) localStorage.setItem(draftKey, JSON.stringify(data));
      setNotice({ type: "error", message: result.message || (isEdit ? "Data gagal diperbarui." : "Data gagal dikirim ke ERP. Draf disimpan di perangkat ini.") });
      return;
    }
    if (isEdit) {
      setNotice({ type: "success", message: "Transaksi penjualan berhasil diperbarui." });
      setTimeout(() => router.push("/penjualan"), 700);
      return;
    }
    localStorage.removeItem(draftKey);
    if (result.data?.id) setCreatedSale({
      id: String(result.data.id),
      approvalStatus: result.data.approvalStatus,
      target: result.data.target,
      testReference: result.data.testReference,
      erpReference: result.data.erpReference
    });
    const defaultRek = defaultTipe ? rekeningForTipe(defaultTipe.id)[0] : undefined;
    reset({ saleDate: today, tipeId: defaultTipe?.id || "", tipeCodeSnapshot: defaultTipe?.code || "", tipeNameSnapshot: defaultTipe?.name || "", rekeningId: defaultRek?.id || "", rekeningNameSnapshot: defaultRek?.name || "", customerName: "Walk In", customerLocation: "Toko", shippingMethod: "di Tempat", paymentMethod: "Cash", items: [{ productRef: "", quantity: 1, unitPrice: 0, discount: 0 }] });
    setNotice({ type: "success", message: result.data?.target === "erp" ? `Data penjualan berhasil dikirim ke ${EXTERNAL_ERP_NAME}.` : result.data?.approvalStatus === "pending_approval" ? "Data berhasil disimpan dan menunggu approval." : `Data penjualan berhasil disimpan di sistem ${APP_BRAND_NAME}.` });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {notice && <Toast {...notice} />}
      {createdSale && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {createdSale.testReference && <p className="mb-2 font-semibold">Referensi pengujian: <code>{createdSale.testReference}</code></p>}
          {createdSale.erpReference && <p className="mb-2">Referensi ERP: <code>{createdSale.erpReference}</code></p>}
          {createdSale.approvalStatus === "approved" ? (
            <Link href={`/print/sales/${createdSale.id}`} className="font-bold underline underline-offset-4">
              Cetak Penjualan
            </Link>
          ) : (
            <span>Cetak final tersedia setelah approval.</span>
          )}
        </div>
      )}
      <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Tujuan transaksi: {targetsErp ? <><b>{EXTERNAL_ERP_NAME}</b> sebagai Invoice Penjualan untuk tipe AJ.</> : <><b>Sistem {APP_BRAND_NAME}</b>. Tipe non-AJ disimpan lokal.</>}
      </p>
      {activeTipes.length === 0 && (
        <DependencyNotice message="Tipe pembukuan aktif belum tersedia. Jalankan seed master data atau atur tipe di Pengaturan." />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="aj-surface overflow-hidden">
            <div className="border-b border-neutral-200 px-5 py-4 sm:px-6"><h2 className="text-base font-bold tracking-tight">Informasi customer</h2></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
              <Field label="Tanggal penjualan" error={errors.saleDate?.message}><Input type="date" {...register("saleDate")} /></Field>
              <Field label="Tipe" error={errors.tipeId?.message}>
                <Select {...register("tipeId")} disabled={activeTipes.length === 0}>
                  {activeTipes.length === 0 && <option value="">— tipe belum tersedia —</option>}
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
                      <span className="block min-w-24 px-5 py-2 text-center text-sm font-semibold text-neutral-600 peer-checked:bg-emerald-600 peer-checked:text-white">{method}</span>
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
              {allowTestTransaction && targetsErp && (
                <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" {...register("isTestTransaction")} />
                  <span><b>Transaksi pengujian</b><span className="mt-0.5 block text-xs">Nama customer dan catatan akan diberi referensi TEST agar mudah ditemukan dan dihapus manual di ERP.</span></span>
                </label>
              )}
            </div>
          </section>
          <section className="aj-surface overflow-hidden">
            <div className="sticky top-2 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div><h2 className="text-base font-bold tracking-tight">Barang</h2><p className="mt-0.5 text-xs text-neutral-500">{fields.length} item</p></div>
              <Button type="button" variant="secondary" onClick={addItem} disabled={productState.status !== "ready"}>+ Tambah barang</Button>
            </div>
            <ProductDependencyState state={productState} onRetry={refreshProducts} />
            <StockDependencyState state={stockState} />
            <div className="hidden grid-cols-[minmax(0,2fr)_78px_120px_100px_120px] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500 md:grid sm:px-6"><span>Barang</span><span>Qty</span><span>Harga satuan</span><span>Diskon</span><span>Subtotal</span></div>
            <div className="divide-y divide-neutral-200">
              {fields.map((field, index) => {
                const selected = productOptions.find((option) => normalizeCode(option.product.code) === normalizeCode(values[index]?.productRef));
                const quantity = Number(values[index]?.quantity || 0);
                const stockExceeded = selected?.quantity !== null && selected?.quantity !== undefined && quantity > selected.quantity;
                return (
                <div id={`sale-item-${index}`} key={field.id} className="scroll-mt-24 p-5 sm:p-6">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_78px_120px_100px_120px]">
                    <Field label="Barang" error={errors.items?.[index]?.productRef?.message}>
                      <ProductSearchSelect
                        name={`items.${index}.productRef`}
                        value={values[index]?.productRef || ""}
                        disabled={productState.status !== "ready"}
                        options={productOptions}
                        onSelect={(option) => {
                          setValue(`items.${index}.productRef`, option.product.code, { shouldDirty: true, shouldValidate: true });
                          if (typeof option.product.sellingPrice === "number" && Number.isFinite(option.product.sellingPrice)) {
                            setValue(`items.${index}.unitPrice`, option.product.sellingPrice, { shouldDirty: true, shouldValidate: true });
                          }
                        }}
                        onInvalidInput={(value) => setValue(`items.${index}.productRef`, value, { shouldDirty: true, shouldValidate: true })}
                      />
                    </Field>
                    <Field label="Qty" error={errors.items?.[index]?.quantity?.message}><Input type="number" min="1" step="1" {...register(`items.${index}.quantity`, { valueAsNumber: true })} /></Field>
                    <Field label="Harga" error={errors.items?.[index]?.unitPrice?.message}><Input type="number" min="0" {...register(`items.${index}.unitPrice`, { valueAsNumber: true })} /></Field>
                    <Field label="Diskon"><Input type="number" min="0" {...register(`items.${index}.discount`, { valueAsNumber: true })} /></Field>
                    <div><p className="mb-1 text-sm font-medium text-slate-700">Subtotal</p><p className="border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-semibold">{rupiah(Number(values[index]?.quantity || 0) * Number(values[index]?.unitPrice || 0) - Number(values[index]?.discount || 0))}</p></div>
                  </div>
                  <ProductSelectionInfo option={selected} stockExceeded={stockExceeded} stockState={stockState} />
                  {fields.length > 1 && <button type="button" onClick={() => remove(index)} className="mt-3 text-xs font-semibold text-red-600">Hapus barang</button>}
                </div>
              );})}
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
            <Button type="submit" className="mt-6 w-full" disabled={isSubmitting || !dependenciesReady || !selectedProductsReady}>{isSubmitting ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Penjualan"}</Button>
            {!dependenciesReady && <p className="mt-2 text-center text-xs text-slate-500">Lengkapi konfigurasi master data dan pastikan produk ERP berhasil dimuat.</p>}
            {dependenciesReady && !selectedProductsReady && <p className="mt-2 text-center text-xs text-slate-500">Pilih barang dari dropdown ERP untuk melanjutkan.</p>}
          </section>
        </aside>
      </div>
      <p className="flex items-center gap-2 text-xs text-neutral-500"><span className="grid h-4 w-4 place-items-center rounded-full border border-neutral-400 text-[10px]">i</span> Data barang ditarik langsung dari ERP saat halaman dibuka. Pastikan data penjualan sudah benar sebelum disimpan.</p>
    </form>
  );
}

export function buildProductOptions(products: Product[], stocks: StockItem[]): ProductOption[] {
  return products.map((product) => {
    const stockRows = stocks.filter((stock) => normalizeCode(stock.productCode) === normalizeCode(product.code));
    const validQuantities = stockRows.map((stock) => stock.quantity).filter((quantity): quantity is number => typeof quantity === "number" && Number.isFinite(quantity));
    const quantity = stockRows.length > 0 && validQuantities.length === stockRows.length ? validQuantities.reduce((sum, value) => sum + value, 0) : null;
    const stockMinimum = stockRows.find((stock) => stock.minimumStock !== null && stock.minimumStock !== undefined)?.minimumStock ?? null;
    const unit = product.unit ?? stockRows.find((stock) => stock.unit)?.unit ?? null;
    const warehouses = Array.from(new Set(stockRows.map((stock) => stock.warehouse).filter((warehouse): warehouse is string => Boolean(warehouse))));
    const warnings = [...(product.dataQualityWarnings ?? []), ...stockRows.flatMap((stock) => stock.dataQualityWarnings ?? [])];
    if (stockRows.length === 0) warnings.push("stok ERP");
    if (quantity === null) warnings.push("qty ERP");
    if (product.sellingPrice === null) warnings.push("harga jual");
    return { product, stockRows, quantity, minimumStock: product.minimumStock ?? stockMinimum, unit, warehouses, warnings: Array.from(new Set(warnings)) };
  });
}

function DependencyNotice({ message }: { message: string }) {
  return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div>;
}

function ProductDependencyState({ state, onRetry }: { state: ProductState; onRetry: () => Promise<void> }) {
  if (state.status === "ready") return <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800 sm:px-6">Produk ERP siap digunakan.</p>;
  if (state.status === "loading") return <p className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-sm text-neutral-600 sm:px-6">Memuat produk dari ERP...</p>;
  return (
    <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div><p className="font-semibold">{state.status === "empty" ? "Produk belum tersedia" : "Produk gagal dimuat"}</p><p className="mt-0.5 text-xs">{state.message}</p></div>
      <Button type="button" variant="secondary" onClick={() => void onRetry()}>Muat ulang</Button>
    </div>
  );
}

function StockDependencyState({ state }: { state: StockState }) {
  if (state.status === "loading") return <p className="border-b border-neutral-100 bg-neutral-50 px-5 py-2 text-xs text-neutral-600 sm:px-6">Memuat stok ERP...</p>;
  if (state.status === "success") return <p className="border-b border-blue-100 bg-blue-50 px-5 py-2 text-xs text-blue-800 sm:px-6">Stok ERP berhasil dimuat · terakhir {state.updatedAt}</p>;
  return <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-800 sm:px-6">{state.message}</p>;
}

function ProductSearchSelect({ name, value, options, disabled, onSelect, onInvalidInput }: {
  name: string;
  value: string;
  options: ProductOption[];
  disabled?: boolean;
  onSelect: (option: ProductOption) => void;
  onInvalidInput: (value: string) => void;
}) {
  const selected = options.find((option) => normalizeCode(option.product.code) === normalizeCode(value));
  const [query, setQuery] = useState(selected ? optionLabel(selected) : value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = normalized ? options.filter((option) => `${option.product.code} ${option.product.name}`.toLowerCase().includes(normalized)) : options;
    return rows.slice(0, 12);
  }, [options, query]);

  const choose = (option: ProductOption) => {
    setQuery(optionLabel(option));
    setOpen(false);
    onSelect(option);
  };

  return (
    <div className="relative">
      <input
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-options`}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Cari kode / nama barang ERP"
        className="block w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-100"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
          onInvalidInput(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          }
          if (event.key === "Enter" && open && filtered[activeIndex]) {
            event.preventDefault();
            choose(filtered[activeIndex]);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && !disabled && (
        <div id={`${name}-options`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 text-sm shadow-xl">
          {filtered.map((option, index) => (
            <button
              key={option.product.id || option.product.code}
              type="button"
              role="option"
              aria-selected={normalizeCode(option.product.code) === normalizeCode(value)}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${index === activeIndex ? "bg-emerald-50" : "hover:bg-neutral-50"}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="block font-bold text-slate-900">{option.product.code} · {option.product.name}</span>
              <span className="mt-0.5 block text-xs text-slate-600">Stok {formatNumber(option.quantity)} {option.unit ?? ""} · {option.warehouses.length ? option.warehouses.join(", ") : "Gudang —"} · Harga {rupiah(option.product.sellingPrice ?? 0)}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">Barang ERP tidak ditemukan.</p>}
        </div>
      )}
    </div>
  );
}

function ProductSelectionInfo({ option, stockExceeded, stockState }: { option?: ProductOption; stockExceeded: boolean; stockState: StockState }) {
  if (!option) return <p className="mt-2 text-xs text-amber-700">Pilih barang dari dropdown ERP. Input bebas tidak dapat disimpan.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
      <span className="rounded-full bg-slate-100 px-2.5 py-1">Stok ERP: <b>{formatNumber(option.quantity)}</b>{option.unit ? ` ${option.unit}` : ""}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1">Gudang: <b>{option.warehouses.length ? option.warehouses.join(", ") : "—"}</b></span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1">Minimum: <b>{formatNumber(option.minimumStock)}</b></span>
      {stockExceeded && <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">Qty melebihi stok ERP</span>}
      {stockState.status === "failed" && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Stok tidak terverifikasi</span>}
      {option.warnings.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Data ERP tidak lengkap</span>}
    </div>
  );
}

function optionLabel(option: ProductOption) {
  return `${option.product.code} — ${option.product.name}`;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("id-ID");
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>;
}
