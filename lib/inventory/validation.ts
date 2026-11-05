import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : undefined));
const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal tidak valid");
const qty = z.coerce.number().finite();

export const locationSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Nama wajib diisi").max(160),
  type: z.enum(["WAREHOUSE", "STORE"]).default("WAREHOUSE"),
  address: optionalText(500),
  phone: optionalText(40),
  erpWarehouseId: z.coerce.number().int().positive().optional().nullable(),
  allowNegative: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: optionalText(1000)
});
export const locationUpdateSchema = locationSchema.partial();

export const productSchema = z.object({
  sku: z.string().trim().min(1, "SKU wajib diisi").max(80),
  name: z.string().trim().min(1, "Nama barang wajib diisi").max(255),
  category: optionalText(120),
  brand: optionalText(120),
  unit: z.string().trim().min(1).max(20).default("PCS"),
  barcode: optionalText(80),
  minimumStock: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().min(0).default(0),
  erpProductId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: optionalText(1000),
  initialStock: z.array(z.object({ locationId: z.string().min(1), quantity: qty.min(0), unitCost: z.coerce.number().min(0).optional() })).optional()
});
export const productUpdateSchema = productSchema.omit({ initialStock: true }).partial();

/** Referensi produk: id lokal, SKU, atau ID produk ERP (untuk klien API eksternal). */
const productRef = z.object({
  productId: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
  erpProductId: z.coerce.number().int().positive().optional()
}).refine((v) => v.productId || v.sku || v.erpProductId, "Produk wajib dipilih (productId, sku, atau erpProductId)");

const itemNotes = optionalText(500);

export const transferSchema = z.object({
  transferNumber: optionalText(60),
  transferDate: dateString.optional(),
  fromLocationId: z.string().min(1, "Lokasi asal wajib dipilih"),
  toLocationId: z.string().min(1, "Lokasi tujuan wajib dipilih"),
  receiveNow: z.boolean().default(true),
  notes: optionalText(1000),
  idempotencyKey: optionalText(120),
  items: z.array(productRef.and(z.object({ quantity: qty.positive("Qty harus lebih dari 0"), notes: itemNotes }))).min(1, "Minimal satu barang")
}).refine((v) => v.fromLocationId !== v.toLocationId, { message: "Lokasi asal dan tujuan tidak boleh sama", path: ["toLocationId"] });

export const opnameSchema = z.object({
  opnameNumber: optionalText(60),
  opnameDate: dateString.optional(),
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  notes: optionalText(1000),
  idempotencyKey: optionalText(120),
  items: z.array(productRef.and(z.object({ countedQty: qty.min(0, "Qty fisik tidak boleh negatif"), notes: itemNotes }))).min(1, "Minimal satu barang")
});

export const adjustmentSchema = z.object({
  adjustmentNumber: optionalText(60),
  adjustmentDate: dateString.optional(),
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  reason: z.string().trim().min(3, "Alasan wajib diisi").max(500),
  notes: optionalText(1000),
  idempotencyKey: optionalText(120),
  items: z.array(productRef.and(z.object({
    quantity: qty.refine((v) => v !== 0, "Qty tidak boleh 0 (positif = tambah, negatif = kurang)"),
    unitCost: z.coerce.number().min(0).optional(),
    notes: itemNotes
  }))).min(1, "Minimal satu barang")
});

export const stockInSchema = z.object({
  referenceNumber: optionalText(60),
  movementDate: dateString.optional(),
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  notes: optionalText(1000),
  idempotencyKey: optionalText(120),
  items: z.array(productRef.and(z.object({ quantity: qty.positive("Qty harus lebih dari 0"), unitCost: z.coerce.number().min(0).optional(), notes: itemNotes }))).min(1)
});

export type LocationInput = z.infer<typeof locationSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductRefInput = z.infer<typeof productRef>;
export type TransferInput = z.infer<typeof transferSchema>;
export type OpnameInput = z.infer<typeof opnameSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
