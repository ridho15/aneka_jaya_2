"use client";
import Link from "next/link";
import {
  useFieldArray,
  useForm,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  penjualanSchema,
  type PenjualanInput,
} from "@/lib/validation/penjualanSchema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types/product";
import type { StockItem } from "@/lib/types/stock";
import type { Sale } from "@/lib/types/sales";
import type {
  BookkeepingType,
  RekeningAccount,
} from "@/lib/business/masterData";
import { APP_BRAND_NAME, EXTERNAL_ERP_NAME } from "@/lib/appBrand";
import { useRouter } from "next/navigation";
import { jakartaDateTimeLocalValue, jakartaTimestampFromLocal } from "@/lib/date/jakarta";

const draftKey = "aneka-jaya-draft-penjualan";
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
const nowJakarta = () => jakartaDateTimeLocalValue();
const today = nowJakarta().slice(0, 10);
const CASH_WALK_IN_REKENING_ID = "cash-w";
const CASH_WALK_IN_REKENING_NAME = "Kas Walk In";
const clampDiscountPercent = (value: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
export function initialSaleDateTimes(sale?: Pick<Sale, "transactionAt" | "deliveryAt">, now: string | Date = new Date()) {
  const transactionAt = sale ? (sale.transactionAt ? jakartaDateTimeLocalValue(sale.transactionAt) : undefined) : jakartaDateTimeLocalValue(now);
  return {
    transactionAt,
    deliveryAt: sale?.deliveryAt ? jakartaDateTimeLocalValue(sale.deliveryAt) : sale ? undefined : transactionAt,
  };
}
export function synchronizedDeliveryAt(transactionAt: string | undefined, currentDeliveryAt: string | undefined, deliveryTouched: boolean) {
  return deliveryTouched ? currentDeliveryAt : transactionAt || "";
}
const itemGross = (item: { quantity?: number; unitPrice?: number }) =>
  Number(item.quantity || 0) * Number(item.unitPrice || 0);
const itemDiscountAmount = (item: {
  quantity?: number;
  unitPrice?: number;
  discount?: number;
}) =>
  Math.round(
    (itemGross(item) * clampDiscountPercent(Number(item.discount || 0))) / 100,
  );
const itemNetTotal = (item: {
  quantity?: number;
  unitPrice?: number;
  discount?: number;
}) => Math.max(0, itemGross(item) - itemDiscountAmount(item));
const discountPercentFromAmount = (
  amount: number | undefined,
  quantity: number,
  unitPrice: number,
) => {
  const gross = quantity * unitPrice;
  if (!gross) return 0;
  return Math.min(
    100,
    Number(((Number(amount || 0) / gross) * 100).toFixed(2)),
  );
};
const pad2 = (value: number) => String(value).padStart(2, "0");
const generateManualSku = (tipeCode?: string | null) => {
  const now = new Date();
  const timestamp = `${String(now.getFullYear()).slice(-2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const code =
    String(tipeCode || "X")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "X";
  return `SLM-${code}-${timestamp}-${suffix}`.toUpperCase();
};

type Props = {
  tipes: BookkeepingType[];
  rekenings: RekeningAccount[];
  allowTestTransaction?: boolean;
  erpTypeCodes?: string[];
  sale?: Sale;
};
type CreatedSale = {
  id: string;
  transactionNumber?: string;
  approvalStatus?: string;
  target?: "erp" | "local";
  syncStatus?: string;
  stockReleaseStatus?: string;
  stockReleaseError?: string;
  erpPaymentStatus?: string;
  erpPaymentError?: string;
  retryable?: boolean;
  testReference?: string;
  erpReference?: string;
  paymentMethod?: string;
};
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
type ProductReferenceOption = { id: number; name: string; code?: string };
type ProductReferenceState =
  | { status: "idle" | "loading" }
  | {
    status: "ready";
    categories: ProductReferenceOption[];
    uoms: ProductReferenceOption[];
  }
  | { status: "error"; message: string };

const normalizeCode = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function extractProductRows(result: unknown): Product[] {
  const data = (result as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return data as Product[];
  const pagedData = (data as { data?: unknown } | null)?.data;
  return Array.isArray(pagedData) ? (pagedData as Product[]) : [];
}

export function PenjualanForm({
  tipes,
  rekenings,
  allowTestTransaction = false,
  erpTypeCodes = ["AJ"],
  sale,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(sale);
  const erpTypeCodeSet = useMemo(
    () =>
      new Set(
        erpTypeCodes.map((code) => code.trim().toUpperCase()).filter(Boolean),
      ),
    [erpTypeCodes],
  );
  const activeTipes = useMemo(() => tipes.filter((t) => t.isActive), [tipes]);
  const defaultTipe = sale
    ? activeTipes.find(
      (tipe) =>
        tipe.id === sale.tipeId || tipe.code === sale.tipeCodeSnapshot,
    ) || activeTipes[0]
    : activeTipes[0];
  const rekeningForTipe = useCallback(
    (selectedTipeId: string) =>
      rekenings.filter((r) => r.tipeIds.includes(selectedTipeId)),
    [rekenings],
  );
  const cashWalkInRekening = useMemo(
    () =>
      rekenings.find((rekening) => rekening.id === CASH_WALK_IN_REKENING_ID),
    [rekenings],
  );
  const defaultRekening = useMemo(() => {
    if (sale?.rekeningId && defaultTipe) {
      const saleRekening = rekenings.find(
        (rekening) =>
          rekening.id === sale.rekeningId &&
          rekening.tipeIds.includes(defaultTipe.id),
      );
      if (saleRekening) return saleRekening;
    }
    if (!sale && cashWalkInRekening) return cashWalkInRekening;
    if (!sale && defaultTipe) return rekeningForTipe(defaultTipe.id)[0];
    return undefined;
  }, [
    cashWalkInRekening,
    defaultTipe,
    rekeningForTipe,
    rekenings,
    sale,
    sale?.rekeningId,
  ]);
  const initialTipeRef = useRef(sale?.tipeId || defaultTipe?.id || "");
  const previousPaymentMethodRef = useRef(sale?.paymentMethod || "Cash");
  const deliveryTouchedRef = useRef(Boolean(sale));

  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  }>();
  const [createdSale, setCreatedSale] = useState<CreatedSale>();
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productState, setProductState] = useState<ProductState>({
    status: "loading",
  });
  const [stockState, setStockState] = useState<StockState>({
    status: "loading",
  });
  const [referenceState, setReferenceState] = useState<ProductReferenceState>({
    status: "idle",
  });
  const productSearchControllerRef = useRef<AbortController>();
  const productSearchRequestRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const [clientRequestId, setClientRequestId] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
  const [duplicateSuspectModal, setDuplicateSuspectModal] = useState<{
    isOpen: boolean;
    message: string;
    existingSaleId?: string;
    existingTransactionNumber?: string;
    existingTotal?: number;
    existingCreatedAt?: string;
    pendingPayload?: PenjualanInput;
  }>({ isOpen: false, message: "" });
  const defaultDateTimes = initialSaleDateTimes(sale);
  const [submitMode, setSubmitMode] = useState<"final" | "draft">(sale?.approvalStatus === "draft" ? "draft" : "final");
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<PenjualanInput>({
    resolver: zodResolver(penjualanSchema),
    defaultValues: {
      isDraft: sale?.approvalStatus === "draft",
      saleDate: sale?.saleDate || today,
      transactionAt: defaultDateTimes.transactionAt,
      deliveryAt: defaultDateTimes.deliveryAt,
      tipeId: sale?.tipeId || defaultTipe?.id || "",
      tipeCodeSnapshot: sale?.tipeCodeSnapshot || defaultTipe?.code || "",
      tipeNameSnapshot: sale?.tipeNameSnapshot || defaultTipe?.name || "",
      rekeningId: sale ? (sale.rekeningId || "") : (defaultRekening?.id || ""),
      rekeningNameSnapshot: sale
        ? (sale.rekeningNameSnapshot || "")
        : (defaultRekening?.name || ""),
      customerName: sale?.customerName || "Walk In",
      customerPhone: sale?.customerPhone || "",
      customerLocation: sale?.customerLocation || "Toko",
      shippingMethod: sale?.shippingMethod || "di Tempat",
      paymentMethod: sale?.paymentMethod || "Cash",
      dueDate: sale?.dueDate,
      initialPaymentAmount: sale?.initialPaymentAmount || 0,
      initialPaymentMethod: sale?.initialPaymentMethod,
      initialPaymentRekeningId: sale?.initialPaymentRekeningId || "",
      initialPaymentRekeningNameSnapshot: sale?.initialPaymentRekeningNameSnapshot || "",
      initialPaymentNotes: sale?.initialPaymentNotes,
      transferAccount: sale?.transferAccount,
      notes: sale?.notes,
      items: sale?.items?.length
        ? sale.items.map((item) => ({
          productRef: item.productRef,
          productId: item.productId,
          productInputMode:
            item.productInputMode || (item.manualProduct ? "manual" : "erp"),
          manualProduct: item.manualProduct,
          warehouseId: item.warehouseId || "",
          warehouseNameSnapshot: item.warehouseNameSnapshot || "",
          rackId: item.rackId,
          rackNameSnapshot: item.rackNameSnapshot,
          unitSnapshot: item.unitSnapshot || "Pcs",
          uomIdSnapshot: item.uomIdSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: discountPercentFromAmount(
            item.discount,
            item.quantity,
            item.unitPrice,
          ),
        }))
        : [
          {
            productRef: "",
            productId: undefined,
            productInputMode: "erp",
            unitSnapshot: undefined,
            uomIdSnapshot: undefined,
            quantity: 1,
            unitPrice: 0,
            discount: 0,
          },
        ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = watch("items");
  const paymentMethod = watch("paymentMethod");
  const initialPaymentAmount = watch("initialPaymentAmount") || 0;
  const initialPaymentMethod = watch("initialPaymentMethod");
  const initialPaymentRekeningId = watch("initialPaymentRekeningId");
  const tipeId = watch("tipeId");
  const rekeningId = watch("rekeningId");
  const customerName = watch("customerName");
  const dueDate = watch("dueDate");
  const transactionAt = watch("transactionAt");
  const deliveryAt = watch("deliveryAt");
  const selectedTipe = activeTipes.find((tipe) => tipe.id === tipeId);
  const targetsErp = Boolean(
    selectedTipe && erpTypeCodeSet.has(selectedTipe.code.trim().toUpperCase()),
  );
  const selectedLooksAj = selectedTipe?.code.trim().toUpperCase() === "AJ";
  const total = values.reduce((sum, item) => sum + itemNetTotal(item), 0);
  const subtotal = values.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const discountTotal = values.reduce(
    (sum, item) => sum + itemDiscountAmount(item),
    0,
  );
  const filteredRekenings = useMemo(
    () => rekeningForTipe(tipeId),
    [rekeningForTipe, tipeId],
  );
  const currentSaleRekening = useMemo(() => {
    if (!sale?.rekeningId) return undefined;
    const existing = rekenings.find(
      (rekening) => rekening.id === sale.rekeningId,
    );
    return (
      existing ?? {
        id: sale.rekeningId,
        bank: sale.rekeningNameSnapshot || sale.rekeningId,
        name: sale.rekeningNameSnapshot || sale.rekeningId,
        accountNumber: "-",
        tipeIds: sale.tipeId ? [sale.tipeId] : [],
      }
    );
  }, [rekenings, sale?.rekeningId, sale?.rekeningNameSnapshot, sale?.tipeId]);
  const rekeningOptions = useMemo(() => {
    if (paymentMethod !== "Cash") return filteredRekenings;
    const options = cashWalkInRekening ? [cashWalkInRekening] : [];
    if (
      isEdit &&
      sale?.paymentMethod === "Cash" &&
      currentSaleRekening &&
      !options.some((rekening) => rekening.id === currentSaleRekening.id)
    ) {
      options.unshift(currentSaleRekening);
    }
    return options;
  }, [
    cashWalkInRekening,
    currentSaleRekening,
    filteredRekenings,
    isEdit,
    paymentMethod,
    sale?.paymentMethod,
  ]);
  const initialPaymentRekeningOptions = initialPaymentMethod === "Cash"
    ? (cashWalkInRekening ? [cashWalkInRekening] : [])
    : filteredRekenings;
  const masterDataReady =
    activeTipes.length > 0 &&
    ((paymentMethod === "Tempo" && (initialPaymentAmount <= 0 || initialPaymentRekeningOptions.length > 0)) ||
      paymentMethod === "Other" ||
      (paymentMethod === "Cash"
        ? Boolean(cashWalkInRekening)
        : filteredRekenings.length > 0));
  const effectiveProducts = useMemo(
    () => mergeProductsWithSaleItems(products, sale),
    [products, sale],
  );
  const productOptions = useMemo(
    () => buildProductOptions(effectiveProducts, stocks),
    [effectiveProducts, stocks],
  );
  const allItemsManual =
    values.length > 0 &&
    values.every((item) => item.productInputMode === "manual");
  const releaseSelectionsReady =
    !targetsErp ||
    values.every(
      (item) => item.productInputMode === "manual" || Boolean(item.warehouseId),
    );
  const releaseQuantitiesReady = true;
  const selectedProductsReady =
    values.length > 0 &&
    values.every(isSalesItemReady) &&
    releaseSelectionsReady;
  const hasManualItems = values.some(
    (item) => item.productInputMode === "manual",
  );
  const dependenciesReady =
    (productState.status === "ready" || allItemsManual) && masterDataReady;

  const isDraftEdit = isEdit && sale?.approvalStatus === "draft";

  const publishBlockingReasons = useMemo(() => {
    const reasons: string[] = [];

    // 1. Kesiapan Master Data & Produk ERP
    if (productState.status === "error") {
      reasons.push("Katalog produk ERP gagal dimuat. Periksa koneksi ke server ERP.");
    }
    if (!masterDataReady) {
      reasons.push("Data tipe pembukuan atau rekening belum siap.");
    }

    // 2. Kesiapan Rincian Barang
    if (!values || values.length === 0) {
      reasons.push("Belum ada barang yang ditambahkan ke pesanan.");
    } else {
      values.forEach((item, index) => {
        const itemNumber = index + 1;
        const itemLabel = item.productRef?.trim() || `Barang #${itemNumber}`;

        if (item.productInputMode === "manual") {
          const sku = item.manualProduct?.sku || item.productRef;
          if (!sku?.trim() || !item.manualProduct?.name?.trim()) {
            reasons.push(`${itemLabel}: Nama dan SKU barang manual wajib diisi.`);
          }
          if (!item.manualProduct?.productCategoryId) {
            reasons.push(`${itemLabel}: Kategori ERP untuk barang manual wajib dipilih.`);
          }
          if (!item.manualProduct?.uomId) {
            reasons.push(`${itemLabel}: Satuan UOM ERP untuk barang manual wajib dipilih.`);
          }
        } else {
          if (!item.productRef?.trim() || !item.productId?.trim()) {
            reasons.push(`Barang #${itemNumber}: Belum dipilih dari katalog produk ERP.`);
          }
        }

        if (Number(item.quantity || 0) <= 0) {
          reasons.push(`${itemLabel}: Kuantitas barang harus lebih dari 0.`);
        }

        // Validasi alokasi gudang saat target mengarah ke ERP (mekanisme setara dengan Create Penjualan)
        if (targetsErp && item.productInputMode !== "manual") {
          if (!item.warehouseId) {
            reasons.push(`${itemLabel}: Lokasi gudang belum dipilih untuk potong stok fisik.`);
          }
        }
      });
    }

    // 3. Validasi Persyaratan Pembayaran untuk Finalisasi
    if (paymentMethod === "TF" && !rekeningId && !getValues("transferAccount")) {
      reasons.push("Pembayaran Transfer (TF): Rekening bank penerima belum dipilih.");
    }

    if (paymentMethod === "Tempo") {
      if (!dueDate || Number.isNaN(Date.parse(dueDate))) {
        reasons.push("Pembayaran Tempo: Tanggal jatuh tempo wajib diisi.");
      }
      if (!customerName || customerName.trim().toLowerCase() === "walk in") {
        reasons.push("Pembayaran Tempo: Nama customer wajib diisi (tidak boleh 'Walk In').");
      }
      if (initialPaymentAmount >= total && total > 0) {
        reasons.push("Pembayaran Tempo: Pembayaran awal (DP) tidak boleh sama atau melebihi total pesanan.");
      }
      if (initialPaymentAmount > 0) {
        if (!initialPaymentMethod) {
          reasons.push("Pembayaran Tempo: Metode pembayaran awal (DP) wajib dipilih.");
        }
        if (!initialPaymentRekeningId) {
          reasons.push("Pembayaran Tempo: Rekening penerima pembayaran awal (DP) wajib dipilih.");
        }
      }
    }

    // 4. Validasi Waktu Kirim
    if (deliveryAt && transactionAt) {
      try {
        const transIso = jakartaTimestampFromLocal(transactionAt);
        const delivIso = jakartaTimestampFromLocal(deliveryAt);
        if (delivIso < transIso) {
          reasons.push("Waktu pengiriman tidak boleh sebelum waktu transaksi.");
        }
      } catch {
        // Ignored, handled by schema validator
      }
    }

    return reasons;
  }, [
    customerName,
    deliveryAt,
    dependenciesReady,
    dueDate,
    getValues,
    initialPaymentAmount,
    initialPaymentMethod,
    initialPaymentRekeningId,
    masterDataReady,
    paymentMethod,
    productOptions,
    productState.status,
    rekeningId,
    targetsErp,
    total,
    transactionAt,
    values,
  ]);

  const addItem = () => {
    const newIndex = fields.length;
    append({
      productRef: "",
      productId: undefined,
      productInputMode: "erp",
      unitSnapshot: undefined,
      uomIdSnapshot: undefined,
      quantity: 1,
      unitPrice: 0,
      discount: 0,
    });
    window.setTimeout(
      () =>
        document
          .getElementById(`sale-item-${newIndex}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };

  const refreshProducts = useCallback(async () => {
    setProductState({ status: "loading" });
    setStockState({ status: "loading" });
    try {
      const productResponse = await fetch("/api/products?page=1&pageSize=100", {
        cache: "no-store",
      });
      const productResult = await productResponse.json().catch(() => null);
      if (!productResponse.ok || !productResult?.success) {
        setProducts([]);
        setStocks([]);
        setProductState({
          status: "error",
          message: productResult?.message || "Produk ERP gagal dimuat.",
          code: productResult?.code,
        });
        setStockState({
          status: "failed",
          message:
            "Stok ERP tidak berhasil dimuat karena daftar barang belum siap.",
        });
        return;
      }
      const rows = extractProductRows(productResult);
      setProducts((current) => mergeErpProductResults(current, rows));
      setProductState(
        rows.length > 0
          ? { status: "ready" }
          : {
            status: "empty",
            message: "ERP belum memiliki produk aktif untuk dipilih.",
          },
      );
      await refreshStocksForProducts();
    } catch {
      setProducts([]);
      setStocks([]);
      setProductState({
        status: "error",
        message: "Koneksi ke layanan produk bermasalah.",
      });
      setStockState({
        status: "failed",
        message: "Koneksi ke layanan stok bermasalah.",
      });
    }
  }, []);

  const searchProducts = useCallback(async (keyword: string) => {
    const value = keyword.trim();
    if (value.length < 2) return;
    productSearchControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++productSearchRequestRef.current;
    productSearchControllerRef.current = controller;
    try {
      const response = await fetch(
        `/api/products?page=1&pageSize=100&keyword=${encodeURIComponent(value)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result = await response.json().catch(() => null);
      if (
        controller.signal.aborted ||
        requestId !== productSearchRequestRef.current
      )
        return;
      if (!response.ok || !result?.success) return;
      const rows = extractProductRows(result);
      setProducts((current) => mergeErpProductResults(current, rows));
      setProductState({ status: "ready" });
      await refreshStocksForProducts();
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      setProductState({
        status: "error",
        message: "Pencarian produk ERP bermasalah.",
      });
    }
  }, []);

  const refreshProductReferences = useCallback(async () => {
    setReferenceState({ status: "loading" });
    try {
      const response = await fetch("/api/product-references", {
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setReferenceState({
          status: "error",
          message: result?.message || "Referensi produk ERP gagal dimuat.",
        });
        return;
      }
      setReferenceState({
        status: "ready",
        categories: result.data?.categories || [],
        uoms: result.data?.uoms || [],
      });
    } catch {
      setReferenceState({
        status: "error",
        message: "Koneksi referensi produk ERP bermasalah.",
      });
    }
  }, []);

  async function refreshStocksForProducts() {
    const stockResponse = await fetch("/api/stocks", { cache: "no-store" });
    const stockResult = await stockResponse.json().catch(() => null);
    if (
      stockResponse.ok &&
      stockResult?.success &&
      Array.isArray(stockResult.data)
    ) {
      setStocks(stockResult.data);
      setStockState({
        status: "success",
        updatedAt: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } else {
      setStocks([]);
      setStockState({
        status: "failed",
        message:
          stockResult?.message ||
          "Stok ERP tidak berhasil dimuat. Pilih barang tanpa memakai angka stok palsu.",
      });
    }
  }

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    if (!hasManualItems || referenceState.status !== "idle") return;
    void refreshProductReferences();
  }, [hasManualItems, referenceState.status, refreshProductReferences]);

  useEffect(() => {
    if (productQuery.trim().length < 2) return;
    const timer = window.setTimeout(
      () => void searchProducts(productQuery),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [productQuery, searchProducts]);

  useEffect(() => () => productSearchControllerRef.current?.abort(), []);

  useEffect(() => {
    const nextDeliveryAt = synchronizedDeliveryAt(transactionAt, getValues("deliveryAt"), deliveryTouchedRef.current);
    if (deliveryTouchedRef.current) return;
    setValue("deliveryAt", nextDeliveryAt, { shouldValidate: true });
  }, [getValues, setValue, transactionAt]);

  useEffect(() => {
    if (isEdit) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const draft = JSON.parse(saved) as PenjualanInput;
        deliveryTouchedRef.current = Object.prototype.hasOwnProperty.call(draft, "deliveryAt");
        reset(draft);
        setNotice({
          type: "error",
          message: "Draf yang belum terkirim telah dipulihkan.",
        });
      } catch {
        localStorage.removeItem(draftKey);
      }
    }
  }, [isEdit, reset]);

  useEffect(() => {
    const tipe = activeTipes.find((t) => t.id === tipeId) ?? activeTipes[0];
    if (!tipe) return;
    setValue("tipeCodeSnapshot", tipe.code);
    setValue("tipeNameSnapshot", tipe.name);
    if (paymentMethod === "Cash") return;
    const reks = rekeningForTipe(tipe.id);
    const currentRekening = reks.find(
      (rekening) => rekening.id === getValues("rekeningId"),
    );
    if (isEdit && initialTipeRef.current === tipe.id && currentRekening) {
      setValue("rekeningNameSnapshot", currentRekening.name);
      return;
    }
    if (isEdit && initialTipeRef.current === tipe.id && !currentRekening)
      return;
    const first = reks[0];
    setValue("rekeningId", first?.id || "");
    setValue("rekeningNameSnapshot", first?.name || "");
    initialTipeRef.current = tipe.id;
  }, [
    activeTipes,
    getValues,
    isEdit,
    paymentMethod,
    rekeningForTipe,
    setValue,
    tipeId,
  ]);

  useEffect(() => {
    const previousPaymentMethod = previousPaymentMethodRef.current;
    if (
      paymentMethod === "Cash" &&
      (!isEdit || previousPaymentMethod !== "Cash")
    ) {
      setValue("rekeningId", cashWalkInRekening?.id || "");
      setValue(
        "rekeningNameSnapshot",
        cashWalkInRekening?.name || CASH_WALK_IN_REKENING_NAME,
      );
    }
    previousPaymentMethodRef.current = paymentMethod;
  }, [cashWalkInRekening, isEdit, paymentMethod, setValue]);

  useEffect(() => {
    if (paymentMethod !== "Tempo") {
      setValue("initialPaymentAmount", 0);
      setValue("initialPaymentMethod", undefined);
      setValue("initialPaymentRekeningId", "");
      setValue("initialPaymentRekeningNameSnapshot", "");
      setValue("initialPaymentNotes", "");
      return;
    }
    if (initialPaymentAmount <= 0) return;
    const options = initialPaymentMethod === "Cash" ? (cashWalkInRekening ? [cashWalkInRekening] : []) : filteredRekenings;
    const current = options.find((item) => item.id === getValues("initialPaymentRekeningId"));
    if (!current && options.length > 0) {
      const selected = options[0];
      setValue("initialPaymentRekeningId", selected?.id || "");
      setValue("initialPaymentRekeningNameSnapshot", selected?.name || "");
    }
  }, [cashWalkInRekening, filteredRekenings, getValues, initialPaymentAmount, initialPaymentMethod, paymentMethod, setValue]);

  const handleProceedDuplicate = async () => {
    if (!duplicateSuspectModal.pendingPayload) return;
    const pending = duplicateSuspectModal.pendingPayload;
    setDuplicateSuspectModal({ isOpen: false, message: "" });
    const freshRequestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setClientRequestId(freshRequestId);
    await submit({
      ...pending,
      allowDuplicate: true,
      clientRequestId: freshRequestId,
    });
  };

  const submit = async (data: PenjualanInput) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      setNotice(undefined);
      setCreatedSale(undefined);
      if (!dependenciesReady) {
        setNotice({
          type: "error",
          message:
            "Form belum siap. Pastikan produk, tipe pembukuan, dan rekening telah tersedia.",
        });
        return;
      }
      const isDraft = submitMode === "draft" || Boolean(data.isDraft);
      const isFinalizingDraft = isEdit && sale?.approvalStatus === "draft" && !isDraft;
      const finalTransactionAt = isFinalizingDraft
        ? (data.transactionAt && data.transactionAt !== defaultDateTimes.transactionAt ? data.transactionAt : nowJakarta())
        : data.transactionAt;
      const finalSaleDate = finalTransactionAt ? finalTransactionAt.slice(0, 10) : data.saleDate;
      const finalDeliveryAt = isFinalizingDraft && (!deliveryTouchedRef.current || data.shippingMethod === "di Tempat" || (data.deliveryAt && data.deliveryAt < (finalTransactionAt || "")))
        ? finalTransactionAt
        : data.deliveryAt;
      const payload: PenjualanInput = {
        ...data,
        isDraft,
        transactionAt: finalTransactionAt,
        saleDate: finalSaleDate,
        deliveryAt: finalDeliveryAt,
        clientRequestId: data.clientRequestId || clientRequestId,
        allowDuplicate: Boolean(data.allowDuplicate),
        items: data.items.map((item) => ({
          ...item,
          discount: itemDiscountAmount(item),
        })),
      };
      const response = await fetch(
        isEdit && sale
          ? `/api/sales/${encodeURIComponent(sale.id)}`
          : "/api/sales",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => ({ success: false, message: "Terjadi kesalahan respons dari server." }));
      if (!response.ok || !result.success) {
        if (result.code === "DUPLICATE_SUSPECTED") {
          setDuplicateSuspectModal({
            isOpen: true,
            message: result.message || "Transaksi dengan data serupa terdeteksi baru saja dibuat.",
            existingSaleId: result.details?.existingSaleId,
            existingTransactionNumber: result.details?.existingTransactionNumber,
            existingTotal: result.details?.existingTotal,
            existingCreatedAt: result.details?.existingCreatedAt,
            pendingPayload: payload,
          });
          return;
        }
        if (!isEdit && !isDraft) localStorage.setItem(draftKey, JSON.stringify(data));
        setNotice({
          type: "error",
          message:
            result.message ||
            (isEdit
              ? "Data gagal diperbarui."
              : "Data gagal diproses."),
        });
        return;
      }
      setClientRequestId(
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      );
      if (isEdit) {
        setNotice({
          type: "success",
          message: isDraft
            ? "Draft penjualan berhasil diperbarui."
            : "Transaksi penjualan berhasil difinalisasi & stok telah dipotong.",
        });
        setTimeout(() => router.push(isDraft ? "/penjualan/draft" : "/penjualan"), 700);
        return;
      }
      localStorage.removeItem(draftKey);
      if (isDraft) {
        setNotice({
          type: "success",
          message: "Draft penjualan berhasil disimpan. Stok gudang belum dipotong.",
        });
        setTimeout(() => router.push("/penjualan/draft"), 800);
        return;
      }
      if (result.data?.id) {
        const createdId = String(result.data.id);
        setCreatedSale({
          id: createdId,
          transactionNumber: result.data.transactionNumber,
          approvalStatus: result.data.approvalStatus,
          target: result.data.target,
          syncStatus: result.data.syncStatus,
          stockReleaseStatus: result.data.stockReleaseStatus,
          stockReleaseError: result.data.stockReleaseError,
          erpPaymentStatus: result.data.erpPaymentStatus,
          erpPaymentError: result.data.erpPaymentError,
          retryable: result.data.retryable === true,
          testReference: result.data.testReference,
          erpReference: result.data.erpReference,
          paymentMethod: result.data.paymentMethod || data.paymentMethod,
        });
        setTimeout(() => {
          router.push(`/penjualan/${encodeURIComponent(createdId)}/invoice?created=1`);
        }, 600);
      }
      const defaultRek =
        cashWalkInRekening ??
        (defaultTipe ? rekeningForTipe(defaultTipe.id)[0] : undefined);
      const nextTransactionAt = nowJakarta();
      deliveryTouchedRef.current = false;
      reset({
        saleDate: nextTransactionAt.slice(0, 10),
        transactionAt: nextTransactionAt,
        deliveryAt: nextTransactionAt,
        tipeId: defaultTipe?.id || "",
        tipeCodeSnapshot: defaultTipe?.code || "",
        tipeNameSnapshot: defaultTipe?.name || "",
        rekeningId: defaultRek?.id || "",
        rekeningNameSnapshot: defaultRek?.name || "",
        customerName: "Walk In",
        customerPhone: "",
        customerLocation: "Toko",
        shippingMethod: "di Tempat",
        paymentMethod: "Cash",
        items: [
          {
            productRef: "",
            productId: undefined,
            productInputMode: "erp",
            quantity: 1,
            unitPrice: 0,
            discount: 0,
          },
        ],
      });
      const isRetryableErp =
        result.data?.target === "erp" &&
        (result.data?.retryable === true ||
          result.data?.syncStatus === "failed" ||
          result.data?.stockReleaseStatus === "failed" ||
          result.data?.erpPaymentStatus === "failed" ||
          result.data?.erpPaymentStatus === "pending");
      const isSyncedErp =
        result.data?.target === "erp" &&
        result.data?.syncStatus === "synced" &&
        result.data?.erpReference;
      setNotice({
        type: isRetryableErp ? "error" : "success",
        message: isRetryableErp
          ? result.data?.syncStatus === "synced" &&
            result.data?.stockReleaseStatus === "failed"
            ? `Invoice terkirim ke ${EXTERNAL_ERP_NAME}, tetapi release stok gagal. Silakan cek ERP Sync.`
            : result.data?.syncStatus === "synced" &&
              result.data?.stockReleaseStatus === "released" &&
              (result.data?.erpPaymentStatus === "failed" ||
                result.data?.erpPaymentStatus === "pending")
              ? `Invoice terkirim dan stok released, tetapi payment ERP perlu dicek di ERP Sync.`
              : `Transaksi tersimpan, tetapi belum terkirim ke ${EXTERNAL_ERP_NAME}. Silakan cek ERP Sync.`
          : isSyncedErp
            ? result.data?.stockReleaseStatus === "released"
              ? result.data?.erpPaymentStatus === "paid" ||
                result.data?.erpPaymentStatus === "partial"
                ? `Invoice terkirim, stok released, dan payment tercatat di ${EXTERNAL_ERP_NAME}.`
                : `Invoice terkirim dan stok berhasil direlease di ${EXTERNAL_ERP_NAME}.`
              : `Data penjualan berhasil dikirim ke ${EXTERNAL_ERP_NAME}.`
            : result.data?.approvalStatus === "pending_approval"
              ? "Data berhasil disimpan dan menunggu approval."
              : `Data penjualan berhasil disimpan di sistem ${APP_BRAND_NAME}.`,
      });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const onInvalid = (fieldErrors: FieldErrors<PenjualanInput>) => {
    const errorList: string[] = [];

    const extractErrors = (obj: Record<string, unknown>, prefix = "") => {
      for (const [key, val] of Object.entries(obj)) {
        if (!val) continue;
        if (typeof val === "object" && "message" in val && typeof val.message === "string") {
          errorList.push(prefix ? `${prefix}: ${val.message}` : val.message);
        } else if (Array.isArray(val)) {
          val.forEach((item, idx) => {
            if (item && typeof item === "object") {
              extractErrors(item as Record<string, unknown>, `Barang #${idx + 1}`);
            }
          });
        } else if (typeof val === "object") {
          extractErrors(val as Record<string, unknown>, prefix);
        }
      }
    };

    extractErrors(fieldErrors as Record<string, unknown>);

    const summary =
      errorList.length > 0
        ? errorList.slice(0, 3).join(" • ") + (errorList.length > 3 ? ` (+${errorList.length - 3} data lainnya)` : "")
        : "Ada data wajib yang belum lengkap atau tidak valid.";

    setNotice({
      type: "error",
      message: `Belum dapat disimpan / dipublish: ${summary}`,
    });

    // Scroll ke field pertama yang bermasalah agar kasir langsung melihat kolom yang harus diisi
    const firstKey = Object.keys(fieldErrors)[0];
    if (firstKey) {
      const el =
        document.querySelector(`[name="${firstKey}"]`) ||
        document.getElementById(firstKey) ||
        document.getElementById("sale-item-0");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit, onInvalid)} className="space-y-5">
      {notice && <Toast {...notice} />}
      {createdSale && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${createdSale.retryable || createdSale.syncStatus === "failed" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
        >
          {createdSale.testReference && (
            <p className="mb-2 font-semibold">
              Referensi pengujian: <code>{createdSale.testReference}</code>
            </p>
          )}
          {createdSale.transactionNumber && <p className="mb-2">Nomor transaksi: <code>{createdSale.transactionNumber}</code></p>}
          {createdSale.erpReference && (
            <p className="mb-2">
              Referensi ERP: <code>{createdSale.erpReference}</code>
            </p>
          )}
          {(createdSale.retryable || createdSale.syncStatus === "failed") && (
            <p className="mb-2 font-semibold">
              {createdSale.syncStatus === "synced" &&
                createdSale.stockReleaseStatus === "failed"
                ? "Invoice sudah terkirim, tetapi release stok perlu retry ERP."
                : createdSale.syncStatus === "synced" &&
                  createdSale.stockReleaseStatus === "released" &&
                  (createdSale.erpPaymentStatus === "failed" ||
                    createdSale.erpPaymentStatus === "pending")
                  ? "Invoice dan stok sudah aman, tetapi payment ERP perlu retry."
                  : "Transaksi tersimpan untuk retry ERP. Status belum synced."}
            </p>
          )}
          {createdSale.erpPaymentError && (
            <p className="mb-2">{createdSale.erpPaymentError}</p>
          )}
          {createdSale.approvalStatus === "approved" ? (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/penjualan/${createdSale.id}/invoice`}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
              >
                {createdSale.paymentMethod === "Tempo"
                  ? "Lihat Nota Tempo (PNG / PDF)"
                  : "Lihat Invoice (PNG / PDF)"}
              </Link>
              <Link
                href={`/penjualan/${createdSale.id}`}
                className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-xs transition-colors"
              >
                Lihat Transaksi
              </Link>
              {!(
                createdSale.retryable || createdSale.syncStatus === "failed"
              ) &&
                (createdSale.target !== "erp" ||
                  Boolean(createdSale.erpReference)) && (
                  <Link
                    href={`/print/sales/${createdSale.id}`}
                    className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Cetak Penjualan
                  </Link>
                )}
              <button
                type="button"
                onClick={() => setCreatedSale(undefined)}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                Input Lagi
              </button>
              {createdSale.target === "erp" &&
                (createdSale.retryable ||
                  createdSale.syncStatus === "failed" ||
                  !createdSale.erpReference) && (
                  <Link
                    href="/erp-sync"
                    className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                  >
                    Lihat ERP Sync
                  </Link>
                )}
            </div>
          ) : (
            <span>Cetak final tersedia setelah approval.</span>
          )}
        </div>
      )}
      <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Tujuan transaksi:{" "}
        {targetsErp ? (
          <>
            <b>{EXTERNAL_ERP_NAME}</b> sebagai Invoice Penjualan dan release
            stok untuk tipe {selectedTipe?.code || "ERP"}.
          </>
        ) : (
          <>
            <b>Sistem {APP_BRAND_NAME}</b>. Tipe ini disimpan lokal.
          </>
        )}
        {selectedLooksAj && !targetsErp && (
          <span className="mt-1 block text-xs font-semibold text-amber-700">
            Tipe terpilih AJ tetapi belum masuk daftar ERP. Cek
            SALES_ERP_TYPE_CODES di server.
          </span>
        )}
      </p>
      {activeTipes.length === 0 && (
        <DependencyNotice message="Tipe pembukuan aktif belum tersedia. Jalankan seed master data atau atur tipe di Pengaturan." />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="aj-surface overflow-hidden">
            <div className="border-b border-neutral-200 px-5 py-4 sm:px-6">
              <h2 className="text-base font-bold tracking-tight">
                Informasi customer
              </h2>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
              <Field label="Tanggal & jam transaksi" error={errors.transactionAt?.message || errors.saleDate?.message}>
                <Input type="datetime-local" {...register("transactionAt")} />
                <input type="hidden" {...register("saleDate")} />
              </Field>
              <Field label="Tipe" error={errors.tipeId?.message}>
                <Select
                  {...register("tipeId")}
                  disabled={activeTipes.length === 0}
                >
                  {activeTipes.length === 0 && (
                    <option value="">— tipe belum tersedia —</option>
                  )}
                  {activeTipes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nama customer" error={errors.customerName?.message}>
                <Input placeholder="Walk In" {...register("customerName")} />
              </Field>
              <Field label="No. HP customer">
                <Input placeholder="08xxx" {...register("customerPhone")} />
              </Field>
              <Field label="Lokasi customer">
                <Input placeholder="Toko" {...register("customerLocation")} />
              </Field>
              <Field label="Ekspedisi">
                <Input
                  placeholder="di Tempat"
                  {...register("shippingMethod")}
                />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Status Pembayaran
                </p>
                <div className="inline-flex flex-wrap border border-neutral-300 bg-white">
                  {["Cash", "TF", "Tempo", "Other"].map((method, i) => (
                    <label
                      key={method}
                      className={`cursor-pointer${i > 0 ? " border-l border-neutral-300" : ""}`}
                    >
                      <input
                        className="peer sr-only"
                        type="radio"
                        value={method}
                        {...register("paymentMethod")}
                      />
                      <span className="block min-w-24 px-5 py-2 text-center text-sm font-semibold text-neutral-600 peer-checked:bg-emerald-600 peer-checked:text-white">
                        {method}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.paymentMethod?.message && (
                  <span className="mt-1 block text-xs text-red-600">
                    {errors.paymentMethod.message}
                  </span>
                )}
              </div>
              {paymentMethod !== "Tempo" && (
                <Field
                  label="Rekening penerima"
                  error={errors.rekeningId?.message}
                >
                  <Select
                    {...register("rekeningId")}
                    onChange={(event) => {
                      const label =
                        event.currentTarget.selectedOptions[0]?.text || "";
                      setValue("rekeningId", event.target.value);
                      setValue("rekeningNameSnapshot", label);
                    }}
                  >
                    {rekeningOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {rekeningOptions.length === 0 && (
                      <option value="">
                        — tidak ada rekening untuk tipe ini —
                      </option>
                    )}
                  </Select>
                  {paymentMethod === "Cash" && !cashWalkInRekening && (
                    <span className="mt-1 block text-xs font-normal text-amber-700">
                      Kas Walk In belum tersedia. Jalankan seed master data atau
                      aktifkan rekening cash-w.
                    </span>
                  )}
                  {paymentMethod !== "Cash" &&
                    filteredRekenings.length === 0 && (
                      <span className="mt-1 block text-xs font-normal text-amber-700">
                        Belum ada rekening untuk tipe ini. Tambah di Pengaturan
                        → Rekening.
                      </span>
                    )}
                </Field>
              )}
              {paymentMethod === "Tempo" && (
                <Field
                  label="Tanggal Jatuh Tempo"
                  error={errors.dueDate?.message}
                >
                  <Input type="date" {...register("dueDate")} />
                </Field>
              )}
              {paymentMethod === "Tempo" && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 sm:col-span-2 lg:col-span-4">
                  <div className="mb-4"><p className="text-sm font-bold text-slate-900">Pembayaran awal / DP</p><p className="mt-1 text-xs text-slate-600">Opsional. Sisa pembayaran otomatis dicatat sebagai piutang Tempo.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Nominal DP" error={errors.initialPaymentAmount?.message}>
                      <MoneyInput value={initialPaymentAmount} onValueChange={(value) => setValue("initialPaymentAmount", value, { shouldDirty: true, shouldValidate: true })} placeholder="0" />
                    </Field>
                    {initialPaymentAmount > 0 && (
                      <Field label="Metode DP" error={errors.initialPaymentMethod?.message}>
                        <Select {...register("initialPaymentMethod")}>
                          <option value="">Pilih metode</option>
                          <option value="Cash">Cash</option>
                          <option value="TF">TF</option>
                          <option value="Other">Other</option>
                        </Select>
                      </Field>
                    )}
                    {initialPaymentAmount > 0 && (
                      <Field label="Rekening penerima" error={errors.initialPaymentRekeningId?.message}>
                        <Select
                          {...register("initialPaymentRekeningId")}
                          onChange={(event) => {
                            const selected = initialPaymentRekeningOptions.find((item) => item.id === event.target.value);
                            setValue("initialPaymentRekeningId", event.target.value, { shouldValidate: true });
                            setValue("initialPaymentRekeningNameSnapshot", selected?.name || "");
                          }}
                        >
                          {initialPaymentRekeningOptions.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                          {initialPaymentRekeningOptions.length === 0 && <option value="">— rekening belum tersedia —</option>}
                        </Select>
                      </Field>
                    )}
                    {initialPaymentAmount > 0 && (
                      <Field label="Catatan DP">
                        <Input {...register("initialPaymentNotes")} placeholder="Opsional" />
                      </Field>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-emerald-100 pt-3 text-sm"><div><p className="text-xs text-slate-500">Total</p><b>{rupiah(total)}</b></div><div><p className="text-xs text-slate-500">Dibayar sekarang</p><b className="text-emerald-700">{rupiah(initialPaymentAmount)}</b></div><div><p className="text-xs text-slate-500">Sisa Tempo</p><b className="text-amber-700">{rupiah(Math.max(0, total - initialPaymentAmount))}</b></div></div>
                </div>
              )}
              <Field label="Tanggal & jam kirim" error={errors.deliveryAt?.message}>
                <Input type="datetime-local" {...register("deliveryAt", { onChange: () => { deliveryTouchedRef.current = true; } })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Catatan">
                  <Textarea
                    rows={1}
                    placeholder="Opsional"
                    {...register("notes")}
                  />
                </Field>
              </div>
              {allowTestTransaction && targetsErp && (
                <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                    {...register("isTestTransaction")}
                  />
                  <span>
                    <b>Transaksi pengujian</b>
                    <span className="mt-0.5 block text-xs">
                      Nama customer dan catatan akan diberi referensi TEST agar
                      mudah ditemukan dan dihapus manual di ERP.
                    </span>
                  </span>
                </label>
              )}
            </div>
          </section>
          <section className="aj-surface overflow-visible">
            <div className="sticky top-2 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div>
                <h2 className="text-base font-bold tracking-tight">Barang</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {fields.length} item
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={addItem}
                disabled={productState.status !== "ready"}
              >
                + Tambah barang
              </Button>
            </div>
            <ProductDependencyState
              state={productState}
              onRetry={refreshProducts}
            />
            <StockDependencyState state={stockState} />
            <div className="hidden grid-cols-[minmax(0,2fr)_78px_135px_95px_135px] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500 md:grid sm:px-6">
              <span>Barang</span>
              <span>Qty</span>
              <span>Harga satuan</span>
              <span>Diskon</span>
              <span>Subtotal</span>
            </div>
            <div className="divide-y divide-neutral-200">
              {fields.map((field, index) => {
                const selected = productOptions.find(
                  (option) =>
                    normalizeCode(option.product.code) ===
                    normalizeCode(values[index]?.productRef),
                );
                const mode = values[index]?.productInputMode || "erp";
                const erpSelectionError =
                  mode === "erp" &&
                    values[index]?.productRef?.trim() &&
                    !values[index]?.productId?.trim()
                    ? "Pilih barang dari hasil pencarian ERP."
                    : undefined;
                const quantity = Number(values[index]?.quantity || 0);
                const selectedStock = selected?.stockRows.find(
                  (row) =>
                    row.warehouseId === values[index]?.warehouseId &&
                    (row.rackId || "") === (values[index]?.rackId || ""),
                );
                const stockExceeded =
                  selectedStock?.quantity !== null &&
                    selectedStock?.quantity !== undefined
                    ? quantity > selectedStock.quantity
                    : selected?.quantity !== null &&
                    selected?.quantity !== undefined &&
                    quantity > selected.quantity;
                return (
                  <div
                    id={`sale-item-${index}`}
                    key={field.id}
                    className="scroll-mt-24 p-5 sm:p-6"
                  >
                    <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <input
                        type="hidden"
                        {...register(`items.${index}.productInputMode`)}
                      />
                      <button
                        type="button"
                        className={`rounded-full border px-3 py-1 ${mode === "erp" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600"}`}
                        onClick={() => {
                          setValue(`items.${index}.productInputMode`, "erp", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(`items.${index}.manualProduct`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(`items.${index}.warehouseId`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(
                            `items.${index}.warehouseNameSnapshot`,
                            undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.rackId`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(
                            `items.${index}.rackNameSnapshot`,
                            undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.unitSnapshot`, undefined, {
                            shouldDirty: true,
                          });
                          setValue(`items.${index}.uomIdSnapshot`, undefined, {
                            shouldDirty: true,
                          });
                        }}
                      >
                        Pilih dari ERP
                      </button>
                      <button
                        type="button"
                        className={`rounded-full border px-3 py-1 ${mode === "manual" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}
                        onClick={() => {
                          const currentRef = values[index]?.productRef || "";
                          setValue(
                            `items.${index}.productInputMode`,
                            "manual",
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.productId`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(`items.${index}.warehouseId`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(
                            `items.${index}.warehouseNameSnapshot`,
                            undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.rackId`, undefined, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(
                            `items.${index}.rackNameSnapshot`,
                            undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.unitSnapshot`, undefined, {
                            shouldDirty: true,
                          });
                          setValue(`items.${index}.uomIdSnapshot`, undefined, {
                            shouldDirty: true,
                          });
                          setValue(
                            `items.${index}.manualProduct.sku`,
                            currentRef,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(
                            `items.${index}.manualProduct.sellingPrice`,
                            Number(values[index]?.unitPrice || 0),
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                      >
                        Barang baru/manual
                      </button>
                      {mode === "manual" && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                          Produk baru akan dibuat di ERP bila SKU belum ada
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_78px_135px_95px_135px]">
                      <Field
                        label="Barang"
                        error={
                          errors.items?.[index]?.productRef?.message ||
                          erpSelectionError
                        }
                      >
                        <input
                          type="hidden"
                          {...register(`items.${index}.productId`)}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.warehouseId`)}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.warehouseNameSnapshot`)}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.rackId`)}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.rackNameSnapshot`)}
                        />
                        <input
                          type="hidden"
                          {...register(`items.${index}.unitSnapshot`)}
                        />
                        {mode === "manual" ? (
                          <div className="flex gap-2">
                            <Input
                              placeholder="SKU produk baru"
                              {...register(`items.${index}.manualProduct.sku`)}
                              onChange={(event) => {
                                setValue(
                                  `items.${index}.manualProduct.sku`,
                                  event.target.value,
                                  { shouldDirty: true, shouldValidate: true },
                                );
                                setValue(
                                  `items.${index}.productRef`,
                                  event.target.value,
                                  { shouldDirty: true, shouldValidate: true },
                                );
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                const sku = generateManualSku(
                                  selectedTipe?.code,
                                );
                                setValue(
                                  `items.${index}.manualProduct.sku`,
                                  sku,
                                  { shouldDirty: true, shouldValidate: true },
                                );
                                setValue(`items.${index}.productRef`, sku, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              }}
                            >
                              Generate SKU
                            </Button>
                          </div>
                        ) : (
                          <ProductSearchSelect
                            name={`items.${index}.productRef`}
                            value={values[index]?.productRef || ""}
                            disabled={productState.status !== "ready"}
                            options={productOptions}
                            onSelect={(option) => {
                              setValue(
                                `items.${index}.productInputMode`,
                                "erp",
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.manualProduct`,
                                undefined,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.productRef`,
                                option.product.code,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.productId`,
                                option.product.productId || option.product.id,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              const effectiveWarehouseId = option.stockRows[0]?.warehouseId ? String(option.stockRows[0].warehouseId) : "1";
                              const effectiveWarehouseName = option.stockRows[0]?.warehouse || "Gudang Utama";
                              const effectiveRackId = option.stockRows[0]?.rackId ? String(option.stockRows[0].rackId) : undefined;
                              const effectiveRackName = option.stockRows[0]?.rack || undefined;
                              const effectiveUnit = option.unit || option.product.unit || option.stockRows.find((stock) => Boolean(stock.unit))?.unit || "Pcs";

                              setValue(
                                `items.${index}.warehouseId`,
                                effectiveWarehouseId,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.warehouseNameSnapshot`,
                                effectiveWarehouseName,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(`items.${index}.rackId`, effectiveRackId, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setValue(
                                `items.${index}.rackNameSnapshot`,
                                effectiveRackName,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.unitSnapshot`,
                                effectiveUnit,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.uomIdSnapshot`,
                                option.product.uomId,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              if (
                                typeof option.product.sellingPrice ===
                                "number" &&
                                Number.isFinite(option.product.sellingPrice)
                              ) {
                                setValue(
                                  `items.${index}.unitPrice`,
                                  option.product.sellingPrice,
                                  { shouldDirty: true, shouldValidate: true },
                                );
                              }
                            }}
                            onInvalidInput={(value) => {
                              setValue(`items.${index}.productRef`, value, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setValue(`items.${index}.productId`, undefined, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setValue(
                                `items.${index}.warehouseId`,
                                undefined,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.warehouseNameSnapshot`,
                                undefined,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(`items.${index}.rackId`, undefined, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setValue(
                                `items.${index}.rackNameSnapshot`,
                                undefined,
                                { shouldDirty: true, shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.unitSnapshot`,
                                undefined,
                                { shouldDirty: true },
                              );
                              setValue(
                                `items.${index}.uomIdSnapshot`,
                                undefined,
                                { shouldDirty: true },
                              );
                            }}
                            onSearch={setProductQuery}
                          />
                        )}
                      </Field>
                      <Field
                        label="Qty"
                        error={errors.items?.[index]?.quantity?.message}
                      >
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          {...register(`items.${index}.quantity`, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <Field
                        label="Harga satuan"
                        error={errors.items?.[index]?.unitPrice?.message}
                      >
                        <MoneyInput
                          id={`items-${index}-unitPrice`}
                          name={`items.${index}.unitPrice`}
                          placeholder="0"
                          title="Harga satuan (dapat diedit)"
                          value={values[index]?.unitPrice}
                          min={0}
                          onValueChange={(value) => {
                            setValue(`items.${index}.unitPrice`, value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            if (mode === "manual")
                              setValue(
                                `items.${index}.manualProduct.sellingPrice`,
                                value,
                                { shouldDirty: true, shouldValidate: true },
                              );
                          }}
                        />
                      </Field>
                      <Field
                        label="Diskon (%)"
                        error={errors.items?.[index]?.discount?.message}
                      >
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.01"
                          value={values[index]?.discount ?? 0}
                          onChange={(event) =>
                            setValue(
                              `items.${index}.discount`,
                              clampDiscountPercent(Number(event.target.value)),
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }
                        />
                      </Field>
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-700">
                          Subtotal
                        </p>
                        <p className="border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-semibold">
                          {rupiah(itemNetTotal(values[index] || {}))}
                        </p>
                      </div>
                    </div>
                    {mode === "manual" ? (
                      <ManualProductFields
                        index={index}
                        register={register}
                        setValue={setValue}
                        values={values}
                        referenceState={referenceState}
                      />
                    ) : (
                      <ProductSelectionInfo
                        option={selected}
                        selectedWarehouseId={values[index]?.warehouseId}
                        selectedRackId={values[index]?.rackId}
                        stockExceeded={stockExceeded}
                        stockState={stockState}
                        targetsErp={targetsErp}
                        onStockSelect={(stock) => {
                          setValue(
                            `items.${index}.warehouseId`,
                            stock.warehouseId,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(
                            `items.${index}.warehouseNameSnapshot`,
                            stock.warehouse || undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                          setValue(`items.${index}.rackId`, stock.rackId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue(
                            `items.${index}.rackNameSnapshot`,
                            stock.rack || undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                      />
                    )}
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="mt-3 text-xs font-semibold text-red-600"
                      >
                        Hapus barang
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {errors.items?.root?.message && (
              <p className="px-5 py-3 text-sm text-red-600">
                {errors.items.root.message}
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="aj-surface p-5">
            <h2 className="text-base font-bold tracking-tight">
              Ringkasan penjualan
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Subtotal</dt>
                <dd>{rupiah(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Diskon</dt>
                <dd>{rupiah(discountTotal)}</dd>
              </div>
              <div className="border-t border-neutral-300 pt-4">
                <dt className="text-sm font-semibold">Total</dt>
                <dd className="mt-1 text-3xl font-bold tracking-tight">
                  {rupiah(total)}
                </dd>
              </div>
            </dl>
            <div className="sticky bottom-3 z-20 mt-6 space-y-2 rounded-md border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur xl:static xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
              {/* Notifikasi error duplikat dekat tombol agar langsung terlihat oleh kasir */}
              {notice && notice.type === "error" && (
                <div className="mb-2">
                  <Toast {...notice} onClose={() => setNotice(undefined)} />
                </div>
              )}

              {/* Banner diagnostik penyebab draft belum dapat dipublish / difinalisasi */}
              {isDraftEdit && publishBlockingReasons.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 shadow-xs mb-3">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1.5">
                    <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Penyebab Draft Belum Dapat Dipublish ({publishBlockingReasons.length}):</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-amber-900">
                    {publishBlockingReasons.map((reason, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] font-medium text-amber-800">
                    Lengkapi data di atas agar dapat difinalisasi &amp; memotong stok di gudang Aneka Jaya. Anda tetap dapat menekan &quot;Perbarui Draft&quot; untuk menyimpan sementara.
                  </p>
                </div>
              )}
              <Button
                type="submit"
                disabled={isSubmitting || !dependenciesReady || !selectedProductsReady}
                onClick={() => {
                  setValue("isDraft", false);
                  setSubmitMode("final");
                  if (isEdit && sale?.approvalStatus === "draft") {
                    const currentNow = nowJakarta();
                    setValue("transactionAt", currentNow);
                    setValue("saleDate", currentNow.slice(0, 10));
                    if (!deliveryTouchedRef.current || getValues("shippingMethod") === "di Tempat") {
                      setValue("deliveryAt", currentNow);
                    }
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && submitMode === "final" ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Menyimpan &amp; Memotong Stok...
                  </span>
                ) : isEdit && sale?.approvalStatus === "draft" ? (
                  "Finalkan & Simpan Penjualan"
                ) : isEdit ? (
                  "Simpan Perubahan"
                ) : (
                  "Simpan Penjualan (Potong Stok)"
                )}
              </Button>
              <Button
                type="submit"
                variant="secondary"
                disabled={isSubmitting || !dependenciesReady}
                onClick={() => {
                  setValue("isDraft", true);
                  setSubmitMode("draft");
                }}
                className="w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && submitMode === "draft" ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-800 border-t-transparent" />
                    Menyimpan Draft...
                  </span>
                ) : isEdit && sale?.approvalStatus === "draft" ? (
                  "Perbarui Draft"
                ) : (
                  "Simpan Draft (Tanpa Potong Stok)"
                )}
              </Button>
            </div>
            {!dependenciesReady && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Lengkapi konfigurasi master data dan pastikan produk ERP
                berhasil dimuat.
              </p>
            )}
            {dependenciesReady && !selectedProductsReady && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Pilih barang dari ERP atau lengkapi data barang manual untuk
                dibuat di ERP.
              </p>
            )}
          </section>
        </aside>
      </div>
      <p className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="grid h-4 w-4 place-items-center rounded-full border border-neutral-400 text-[10px]">
          i
        </span>{" "}
        Barang dapat dipilih dari ERP atau dibuat sebagai produk baru di Aneka
        Jaya ERP. Transaksi non-AJ tetap lokal, tetapi produk manual tetap
        disinkronkan ke ERP.
      </p>

      <ConfirmationModal
        isOpen={duplicateSuspectModal.isOpen}
        title="Peringatan Transaksi Kembar / Duplikat"
        variant="warning"
        confirmLabel="Ya, Tetap Simpan Transaksi Baru"
        cancelLabel="Batal & Periksa Nota"
        onCancel={() => setDuplicateSuspectModal({ isOpen: false, message: "" })}
        onConfirm={handleProceedDuplicate}
        isLoading={isSubmitting}
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p className="font-medium text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded-xl leading-relaxed">
            {duplicateSuspectModal.message}
          </p>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Nomor Nota Sebelumnya:</span>
              <span className="font-semibold text-slate-800">{duplicateSuspectModal.existingTransactionNumber || "-"}</span>
            </div>
            {duplicateSuspectModal.existingTotal !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-500">Total Transaksi:</span>
                <span className="font-semibold text-slate-800">{rupiah(duplicateSuspectModal.existingTotal)}</span>
              </div>
            )}
            {duplicateSuspectModal.existingCreatedAt && (
              <div className="flex justify-between">
                <span className="text-slate-500">Waktu Dibuat:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(duplicateSuspectModal.existingCreatedAt).toLocaleString("id-ID")}
                </span>
              </div>
            )}
          </div>
          {duplicateSuspectModal.existingSaleId && (
            <div className="pt-1">
              <a
                href={`/penjualan/${duplicateSuspectModal.existingSaleId}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-600 hover:text-sky-800 hover:underline inline-flex items-center gap-1.5 font-medium"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Buka &amp; Periksa Invoice Sebelumnya di Tab Baru</span>
              </a>
            </div>
          )}
          <p className="text-xs text-slate-500 italic">
            Jika ini adalah transaksi baru yang memang memiliki rincian sama, tekan &quot;Ya, Tetap Simpan Transaksi Baru&quot;. Jika Anda tidak sengaja mengklik ganda atau menginput nota yang sama, tekan &quot;Batal &amp; Periksa Nota&quot;.
          </p>
        </div>
      </ConfirmationModal>
    </form>
  );
}

export function buildProductOptions(
  products: Product[],
  stocks: StockItem[],
): ProductOption[] {
  return products.map((product) => {
    const stockRows = stocks.filter(
      (stock) =>
        normalizeCode(stock.productCode) === normalizeCode(product.code),
    );
    const validQuantities = stockRows
      .map((stock) => stock.quantity)
      .filter(
        (quantity): quantity is number =>
          typeof quantity === "number" && Number.isFinite(quantity),
      );
    const quantity =
      product.stockSummary?.quantity ??
      (stockRows.length > 0 && validQuantities.length === stockRows.length
        ? validQuantities.reduce((sum, value) => sum + value, 0)
        : null);
    const stockMinimum =
      product.stockSummary?.minimumStock ??
      stockRows.find(
        (stock) =>
          stock.minimumStock !== null && stock.minimumStock !== undefined,
      )?.minimumStock ??
      null;
    const unit =
      product.unit ?? stockRows.find((stock) => stock.unit)?.unit ?? null;
    const warehouses = Array.from(
      new Set(
        stockRows
          .map((stock) => stock.warehouse)
          .filter((warehouse): warehouse is string => Boolean(warehouse)),
      ),
    );
    const warnings = [
      ...(product.dataQualityWarnings ?? []),
      ...stockRows.flatMap((stock) => stock.dataQualityWarnings ?? []),
    ];
    if (stockRows.length === 0 && !product.stockSummary)
      warnings.push("stok ERP");
    if (quantity === null) warnings.push("qty ERP");
    if (product.sellingPrice === null) warnings.push("harga jual");
    return {
      product,
      stockRows,
      quantity,
      minimumStock: product.minimumStock ?? stockMinimum,
      unit,
      warehouses,
      warnings: Array.from(new Set(warnings)),
    };
  });
}

function productCacheKey(product: Product) {
  return product.productId?.trim()
    ? `id:${product.productId.trim()}`
    : `sku:${normalizeCode(product.code)}`;
}

export function mergeErpProductResults(
  current: Product[],
  incoming: Product[],
): Product[] {
  const products = new Map(
    current.map((product) => [productCacheKey(product), product]),
  );
  for (const product of incoming)
    products.set(productCacheKey(product), product);
  return Array.from(products.values());
}

export function isSalesItemReady(item: PenjualanInput["items"][number]) {
  if (item.productInputMode === "manual") {
    const sku = item.manualProduct?.sku || item.productRef;
    const hasBasic = Boolean(
      String(sku || "").trim() && String(item.manualProduct?.name || "").trim(),
    );
    return (
      hasBasic &&
      Boolean(
        item.manualProduct?.productCategoryId &&
        item.manualProduct?.uomId &&
        String(item.manualProduct?.brandCode || "").trim(),
      )
    );
  }
  return Boolean(item.productRef?.trim() && item.productId?.trim());
}

function mergeProductsWithSaleItems(
  products: Product[],
  sale?: Sale,
): Product[] {
  if (!sale?.items?.length) return products;
  const existingCodes = new Set(
    products.map((product) => normalizeCode(product.code)),
  );
  const fallbacks = sale.items
    .filter(
      (item) =>
        item.productRef && !existingCodes.has(normalizeCode(item.productRef)),
    )
    .map(
      (item): Product => ({
        id: `saved-${item.productRef}`,
        productId: item.productId,
        code: item.productRef,
        name: `Produk tersimpan ${item.productRef}`,
        category: null,
        unit: item.unitSnapshot || null,
        uomId: item.uomIdSnapshot,
        sellingPrice: item.unitPrice,
        costPrice: null,
        minimumStock: null,
        isActive: true,
        updatedAt: sale.createdAt || new Date().toISOString(),
        dataQualityWarnings: [
          "Produk tidak masuk hasil produk ERP awal. Cari dan pilih ulang bila ingin mengganti barang.",
        ],
      }),
    );
  return [...products, ...fallbacks];
}

function DependencyNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {message}
    </div>
  );
}

function ProductDependencyState({
  state,
  onRetry,
}: {
  state: ProductState;
  onRetry: () => Promise<void>;
}) {
  if (state.status === "ready")
    return (
      <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800 sm:px-6">
        Produk ERP siap digunakan.
      </p>
    );
  if (state.status === "loading")
    return (
      <p className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-sm text-neutral-600 sm:px-6">
        Memuat produk dari ERP...
      </p>
    );
  return (
    <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="font-semibold">
          {state.status === "empty"
            ? "Produk belum tersedia"
            : "Produk gagal dimuat"}
        </p>
        <p className="mt-0.5 text-xs">{state.message}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => void onRetry()}>
        Muat ulang
      </Button>
    </div>
  );
}

function StockDependencyState({ state }: { state: StockState }) {
  if (state.status === "loading")
    return (
      <p className="border-b border-neutral-100 bg-neutral-50 px-5 py-2 text-xs text-neutral-600 sm:px-6">
        Memuat stok ERP...
      </p>
    );
  if (state.status === "success")
    return (
      <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800 sm:px-6">
        Stok ERP berhasil dimuat · terakhir {state.updatedAt}
      </p>
    );
  return (
    <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-800 sm:px-6">
      {state.message}
    </p>
  );
}

function ProductSearchSelect({
  name,
  value,
  options,
  disabled,
  onSelect,
  onInvalidInput,
  onSearch,
}: {
  name: string;
  value: string;
  options: ProductOption[];
  disabled?: boolean;
  onSelect: (option: ProductOption) => void;
  onInvalidInput: (value: string) => void;
  onSearch?: (value: string) => void;
}) {
  const selected = options.find(
    (option) => normalizeCode(option.product.code) === normalizeCode(value),
  );
  const [query, setQuery] = useState(selected ? optionLabel(selected) : value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = normalized
      ? options.filter((option) =>
        `${option.product.code} ${option.product.name}`
          .toLowerCase()
          .includes(normalized),
      )
      : options;
    return rows.slice(0, 12);
  }, [options, query]);

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQuery(selected ? optionLabel(selected) : value);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selected, value]);

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
          onSearch?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              Math.min(current + 1, Math.max(0, filtered.length - 1)),
            );
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
        <div
          id={`${name}-options`}
          role="listbox"
          className="absolute z-[100] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 text-sm shadow-xl"
        >
          {filtered.map((option, index) => (
            <button
              key={option.product.id || option.product.code}
              type="button"
              role="option"
              aria-selected={
                normalizeCode(option.product.code) === normalizeCode(value)
              }
              className={`w-full rounded-lg px-3 py-2 text-left transition ${index === activeIndex ? "bg-emerald-50" : "hover:bg-neutral-50"}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="block font-bold text-slate-900">
                {option.product.code} · {option.product.name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Stok {formatNumber(option.quantity)} {option.unit ?? ""} ·{" "}
                {option.warehouses.length
                  ? option.warehouses.join(", ")
                  : "Gudang —"}{" "}
                · Harga {rupiah(option.product.sellingPrice ?? 0)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-slate-500">
              Barang ERP tidak ditemukan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProductSelectionInfo({
  option,
  selectedWarehouseId,
  selectedRackId,
  stockExceeded,
  stockState,
  targetsErp,
  onStockSelect,
}: {
  option?: ProductOption;
  selectedWarehouseId?: string;
  selectedRackId?: string;
  stockExceeded: boolean;
  stockState: StockState;
  targetsErp: boolean;
  onStockSelect: (stock: StockItem) => void;
}) {
  if (!option)
    return (
      <p className="mt-2 text-xs text-amber-700">
        Pilih barang dari dropdown ERP. Input bebas tidak dapat disimpan.
      </p>
    );
  const stockOptions = option.stockRows.filter((stock) => stock.warehouseId);
  const selectedKey = selectedWarehouseId
    ? `${selectedWarehouseId}::${selectedRackId || ""}`
    : "";
  return (
    <div className="mt-2 space-y-2 text-xs text-slate-600">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">
          Stok ERP: <b>{formatNumber(option.quantity)}</b>
          {option.unit ? ` ${option.unit}` : ""}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">
          Gudang:{" "}
          <b>{option.warehouses.length ? option.warehouses.join(", ") : "—"}</b>
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">
          Minimum: <b>{formatNumber(option.minimumStock)}</b>
        </span>
        {stockExceeded && (
          <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
            Qty melebihi stok lokasi
          </span>
        )}
        {stockState.status === "failed" && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
            Stok tidak terverifikasi
          </span>
        )}
        {option.warnings.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
            Data ERP tidak lengkap
          </span>
        )}
      </div>
      {targetsErp && (
        <label className="block max-w-xl text-xs font-semibold text-slate-700">
          Lokasi release stok
          <select
            className="mt-1 block w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={selectedKey}
            onChange={(event) => {
              const stock = stockOptions.find(
                (row) =>
                  `${row.warehouseId || ""}::${row.rackId || ""}` ===
                  event.target.value,
              );
              if (stock) onStockSelect(stock);
            }}
          >
            <option value="">Pilih gudang/rak untuk release stok</option>
            {stockOptions.map((stock) => (
              <option
                key={`${stock.warehouseId || ""}::${stock.rackId || ""}`}
                value={`${stock.warehouseId || ""}::${stock.rackId || ""}`}
              >
                {stock.warehouse || "Gudang"}
                {stock.rack ? ` / ${stock.rack}` : ""} · stok{" "}
                {formatNumber(stock.quantity)} {stock.unit || ""}
              </option>
            ))}
          </select>
          {stockOptions.length === 0 && (
            <span className="mt-1 block font-normal text-amber-700">
              ERP belum mengirim warehouse_id untuk produk ini.
            </span>
          )}
        </label>
      )}
    </div>
  );
}

function ManualProductFields({
  index,
  register,
  setValue,
  values,
  referenceState,
}: {
  index: number;
  register: UseFormRegister<PenjualanInput>;
  setValue: UseFormSetValue<PenjualanInput>;
  values: PenjualanInput["items"];
  referenceState: ProductReferenceState;
}) {
  const unitPrice = Number(values[index]?.unitPrice || 0);
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Nama produk manual">
          <Input
            placeholder="Nama produk baru"
            {...register(`items.${index}.manualProduct.name`)}
          />
        </Field>
        <Field label="Harga modal">
          <MoneyInput
            value={values[index]?.manualProduct?.costPrice}
            min={0}
            onValueChange={(value) =>
              setValue(`items.${index}.manualProduct.costPrice`, value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Kode merk">
          <Input
            placeholder="Contoh: UMUM"
            {...register(`items.${index}.manualProduct.brandCode`)}
          />
        </Field>
        <Field label="Harga jual ERP">
          <MoneyInput
            min={0}
            value={unitPrice}
            onValueChange={(value) => {
              setValue(`items.${index}.unitPrice`, value, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue(`items.${index}.manualProduct.sellingPrice`, value, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          />
        </Field>
        <Field label="Kategori ERP">
          <Select
            {...register(`items.${index}.manualProduct.productCategoryId`, {
              valueAsNumber: true,
            })}
            disabled={referenceState.status !== "ready"}
          >
            <option value="">— pilih kategori —</option>
            {referenceState.status === "ready" &&
              referenceState.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ""}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Satuan ERP">
          <Select
            {...register(`items.${index}.manualProduct.uomId`, {
              valueAsNumber: true,
            })}
            disabled={referenceState.status !== "ready"}
            onChange={(event) => {
              const uomId = Number(event.target.value);
              const selectedUom =
                referenceState.status === "ready"
                  ? referenceState.uoms.find((item) => item.id === uomId)
                  : undefined;
              setValue(
                `items.${index}.manualProduct.uomId`,
                Number.isFinite(uomId) && uomId > 0 ? uomId : undefined,
                { shouldDirty: true, shouldValidate: true },
              );
              setValue(
                `items.${index}.uomIdSnapshot`,
                Number.isFinite(uomId) && uomId > 0 ? uomId : undefined,
                { shouldDirty: true, shouldValidate: true },
              );
              setValue(
                `items.${index}.unitSnapshot`,
                selectedUom?.code || selectedUom?.name || undefined,
                { shouldDirty: true, shouldValidate: true },
              );
            }}
          >
            <option value="">— pilih satuan —</option>
            {referenceState.status === "ready" &&
              referenceState.uoms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ""}
                </option>
              ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Catatan produk">
            <Input
              placeholder="Opsional, tersimpan sebagai deskripsi produk ERP"
              {...register(`items.${index}.manualProduct.description`)}
            />
          </Field>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-amber-800">
        {referenceState.status === "error"
          ? referenceState.message
          : "SKU akan dicek ke ERP. Jika belum ada, produk dibuat otomatis di Aneka Jaya ERP sebelum transaksi disimpan."}
      </p>
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
      {error && (
        <span className="mt-1 block text-xs font-normal text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
