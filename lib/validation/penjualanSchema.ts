import { z } from "zod";
import { jakartaTimestampFromLocal } from "@/lib/date/jakarta";

const date = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal tidak valid");
const manualProductSchema = z.object({
  sku: z.string().trim().min(1, "Kode produk manual wajib diisi").max(80),
  name: z.string().trim().min(1, "Nama produk manual wajib diisi").max(150),
  productCategoryId: z.coerce.number().int().positive("Kategori ERP wajib dipilih").optional(),
  uomId: z.coerce.number().int().positive("Satuan ERP wajib dipilih").optional(),
  brandCode: z.string().trim().max(80).optional(),
  costPrice: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Harga modal tidak boleh negatif").default(0)).optional(),
  sellingPrice: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Harga jual tidak boleh negatif").default(0)).optional(),
  description: z.string().trim().max(500).optional()
});
export const penjualanSchema = z.object({
  saleDate: date,
  transactionAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal dan jam transaksi tidak valid").optional(),
  deliveryAt: z.string().optional(),
  tipeId: z.string().trim().min(1, "Tipe wajib dipilih").default("W"),
  tipeCodeSnapshot: z.string().trim().default("W"),
  tipeNameSnapshot: z.string().trim().default("W"),
  rekeningId: z.string().trim().max(150).optional(),
  rekeningNameSnapshot: z.string().trim().max(150).optional(),
  customerName: z.preprocess((value) => !String(value ?? "").trim() ? "Walk In" : value, z.string().trim().max(150)),
  customerLocation: z.preprocess((value) => !String(value ?? "").trim() ? "Toko" : value, z.string().trim().max(200)),
  deliveryDate: z.string().optional(),
  shippingMethod: z.preprocess((value) => !String(value ?? "").trim() ? "di Tempat" : value, z.string().trim().max(100)),
  paymentMethod: z.enum(["Cash", "TF", "Tempo", "Other"], { required_error: "Pilih metode pembayaran" }),
  dueDate: z.string().optional(),
  initialPaymentAmount: z.preprocess((value) => value === "" || value === undefined || Number.isNaN(value) ? 0 : value, z.coerce.number().finite().min(0, "Pembayaran awal tidak boleh negatif")).default(0),
  initialPaymentMethod: z.enum(["Cash", "TF", "Other"]).optional(),
  initialPaymentRekeningId: z.string().trim().max(150).optional(),
  initialPaymentRekeningNameSnapshot: z.string().trim().max(150).optional(),
  initialPaymentNotes: z.string().trim().max(1000).optional(),
  transferAccount: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(1000).optional(),
  isTestTransaction: z.boolean().optional(),
  items: z.array(z.object({
    productRef: z.string().trim().min(1, "Kode atau nama barang wajib diisi").max(150),
    productId: z.string().trim().max(50).optional(),
    productInputMode: z.enum(["erp", "manual"]).default("erp").optional(),
    manualProduct: manualProductSchema.optional(),
    warehouseId: z.string().trim().max(80).optional(),
    warehouseNameSnapshot: z.string().trim().max(150).optional(),
    rackId: z.string().trim().max(80).optional(),
    rackNameSnapshot: z.string().trim().max(150).optional(),
    unitSnapshot: z.string().trim().max(50).optional(),
    uomIdSnapshot: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive("Quantity harus lebih dari 0"),
    unitPrice: z.coerce.number().min(0, "Harga satuan tidak boleh negatif"),
    discount: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Diskon tidak boleh negatif")).default(0)
  })).min(1, "Minimal satu barang diperlukan")
}).superRefine((data, ctx) => {
  if (data.deliveryDate && Number.isNaN(Date.parse(data.deliveryDate))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal kirim tidak valid", path: ["deliveryDate"] });
  }
  if (data.deliveryAt) {
    try {
      const transactionAt = jakartaTimestampFromLocal(data.transactionAt || `${data.saleDate}T00:00`);
      const deliveryAt = jakartaTimestampFromLocal(data.deliveryAt);
      if (deliveryAt < transactionAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal dan jam kirim tidak boleh sebelum waktu transaksi", path: ["deliveryAt"] });
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal dan jam kirim tidak valid", path: ["deliveryAt"] });
    }
  }
  if (data.paymentMethod === "TF" && !data.rekeningId && !data.transferAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih rekening penerima untuk TF", path: ["rekeningId"] });
  }
  if (data.paymentMethod === "Tempo") {
    if (!data.dueDate || Number.isNaN(Date.parse(data.dueDate))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal jatuh tempo wajib diisi untuk Tempo", path: ["dueDate"] });
    if (!data.customerName || data.customerName === "Walk In") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nama customer wajib untuk Tempo", path: ["customerName"] });
    const total = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0);
    if (data.initialPaymentAmount >= total && total > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pembayaran awal harus lebih kecil dari total. Gunakan Cash atau TF jika langsung lunas.", path: ["initialPaymentAmount"] });
    if (data.initialPaymentAmount > 0 && !data.initialPaymentMethod) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih metode pembayaran awal", path: ["initialPaymentMethod"] });
    if (data.initialPaymentAmount > 0 && !data.initialPaymentRekeningId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih rekening penerima pembayaran awal", path: ["initialPaymentRekeningId"] });
  } else if (data.initialPaymentAmount > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pembayaran awal hanya tersedia untuk transaksi Tempo", path: ["initialPaymentAmount"] });
  }
});
export type PenjualanInput = z.infer<typeof penjualanSchema>;
