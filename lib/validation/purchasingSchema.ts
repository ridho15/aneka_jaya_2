import { z } from "zod";

export const RateTypeEnum = z.enum(["BOOKING", "BANK_ACTUAL", "TAX_KMK"]);
export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PARTIAL_RECEIVED",
  "COMPLETED",
  "CANCELLED"
]);
export const PurchaseInvoiceStatusEnum = z.enum([
  "DRAFT",
  "POSTED",
  "PARTIAL_PAID",
  "PAID",
  "CANCELLED"
]);
export const LandedCostTypeEnum = z.enum([
  "FREIGHT",
  "CUSTOMS_DUTY",
  "IMPORT_TAX_PPN",
  "IMPORT_TAX_PPH22",
  "INSURANCE",
  "HANDLING",
  "OTHER"
]);
export const LandedCostAllocationMethodEnum = z.enum(["BY_VALUE", "BY_QUANTITY"]);

export const CurrencyRateSchema = z.object({
  currency: z.string().min(2).max(10).toUpperCase(),
  rateDate: z.string().or(z.date()),
  rateType: RateTypeEnum,
  rate: z.number().positive("Kurs harus lebih besar dari 0"),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export type CurrencyRateInput = z.infer<typeof CurrencyRateSchema>;

export const SupplierSchema = z.object({
  code: z.string().min(2, "Kode supplier minimal 2 karakter").toUpperCase(),
  name: z.string().min(2, "Nama supplier minimal 2 karakter"),
  country: z.string().min(2).max(3).toUpperCase().default("ID"),
  currency: z.string().min(2).max(10).toUpperCase().default("IDR"),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).default(30),
  isActive: z.boolean().default(true)
});

export type SupplierInput = z.infer<typeof SupplierSchema>;

export const PurchaseOrderItemSchema = z.object({
  itemCode: z.string().min(1, "Kode barang wajib diisi"),
  itemName: z.string().min(1, "Nama barang wajib diisi"),
  unit: z.string().default("PCS"),
  quantity: z.number().positive("Kuantitas harus lebih dari 0"),
  unitPriceOriginal: z.number().min(0, "Harga satuan tidak boleh negatif"),
  notes: z.string().optional().nullable()
});

export type PurchaseOrderItemInput = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderSchema = z.object({
  poNumber: z.string().optional().nullable(),
  supplierId: z.string().min(1, "Supplier wajib dipilih"),
  orderDate: z.string().or(z.date()),
  expectedDeliveryDate: z.string().or(z.date()).optional().nullable(),
  currency: z.string().min(2).max(10).toUpperCase().default("USD"),
  exchangeRate: z.number().positive("Kurs harus lebih dari 0").default(1),
  rateType: RateTypeEnum.optional(),
  items: z.array(PurchaseOrderItemSchema).min(1, "Minimal harus ada 1 item pesanan"),
  notes: z.string().optional().nullable()
});

export type PurchaseOrderInput = z.infer<typeof PurchaseOrderSchema>;

export const PurchaseReceiptItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1, "ID item PO wajib ada"),
  itemCode: z.string().optional(),
  itemName: z.string().optional(),
  unit: z.string().optional(),
  quantityReceived: z.number().positive("Kuantitas diterima harus lebih dari 0"),
  notes: z.string().optional().nullable()
});

export const PurchaseReceiptSchema = z.object({
  grnNumber: z.string().optional().nullable(),
  purchaseOrderId: z.string().min(1, "ID Purchase Order wajib diisi"),
  receiptDate: z.string().or(z.date()),
  warehouseName: z.string().default("Gudang Utama"),
  items: z.array(PurchaseReceiptItemSchema).min(1, "Minimal harus ada 1 item yang diterima"),
  notes: z.string().optional().nullable()
});

export type PurchaseReceiptInput = z.infer<typeof PurchaseReceiptSchema>;

export const LandedCostItemSchema = z.object({
  costType: LandedCostTypeEnum,
  isCreditableTax: z.boolean().default(false),
  description: z.string().min(1, "Keterangan biaya landed cost wajib diisi"),
  vendorName: z.string().optional().nullable(),
  originalCurrency: z.string().default("IDR"),
  originalAmount: z.number().positive("Nominal biaya harus lebih dari 0"),
  exchangeRate: z.number().positive("Kurs harus lebih dari 0").default(1),
  amountIdr: z.number().optional(),
  allocationMethod: LandedCostAllocationMethodEnum.default("BY_VALUE"),
  paymentAccountId: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export type LandedCostItemInput = z.infer<typeof LandedCostItemSchema>;

export const PurchaseInvoiceSchema = z.object({
  invoiceNumber: z.string().optional().nullable(),
  supplierInvoiceNumber: z.string().min(1, "Nomor invoice supplier wajib diisi"),
  purchaseOrderId: z.string().optional().nullable(),
  supplierId: z.string().min(1, "Supplier wajib dipilih"),
  invoiceDate: z.string().or(z.date()),
  dueDate: z.string().or(z.date()),
  currency: z.string().min(2).max(10).toUpperCase().default("USD"),
  exchangeRate: z.number().positive("Kurs invoice harus lebih dari 0"),
  subtotalOriginal: z.number().positive("Nilai invoice harus lebih dari 0"),
  landedCosts: z.array(LandedCostItemSchema).optional().default([]),
  notes: z.string().optional().nullable()
});

export type PurchaseInvoiceInput = z.infer<typeof PurchaseInvoiceSchema>;

export const PurchasePaymentSchema = z.object({
  paymentNumber: z.string().optional().nullable(),
  purchaseInvoiceId: z.string().min(1, "Invoice pembelian wajib dipilih"),
  paymentDate: z.string().or(z.date()),
  rekeningAccountId: z.string().min(1, "Rekening sumber wajib dipilih"),
  amountPaidOriginal: z.number().positive("Jumlah valas dibayar harus lebih dari 0"),
  paymentRate: z.number().positive("Kurs pembayaran aktual harus lebih dari 0"),
  notes: z.string().optional().nullable()
});

export type PurchasePaymentInput = z.infer<typeof PurchasePaymentSchema>;
