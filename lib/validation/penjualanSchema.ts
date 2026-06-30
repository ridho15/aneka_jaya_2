import { z } from "zod";

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
  transferAccount: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(1000).optional(),
  isTestTransaction: z.boolean().optional(),
  items: z.array(z.object({
    productRef: z.string().trim().min(1, "Kode atau nama barang wajib diisi").max(150),
    productId: z.string().trim().max(50).optional(),
    productInputMode: z.enum(["erp", "manual"]).default("erp").optional(),
    manualProduct: manualProductSchema.optional(),
    quantity: z.coerce.number().positive("Quantity harus lebih dari 0"),
    unitPrice: z.coerce.number().min(0, "Harga satuan tidak boleh negatif"),
    discount: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Diskon tidak boleh negatif")).default(0)
  })).min(1, "Minimal satu barang diperlukan")
}).superRefine((data, ctx) => {
  if (data.deliveryDate && Number.isNaN(Date.parse(data.deliveryDate))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal kirim tidak valid", path: ["deliveryDate"] });
  }
  if (["Cash", "TF"].includes(data.paymentMethod) && !data.rekeningId && !data.transferAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih rekening penerima untuk Cash/TF", path: ["rekeningId"] });
  }
  if (data.paymentMethod === "Tempo") {
    if (!data.dueDate || Number.isNaN(Date.parse(data.dueDate))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal jatuh tempo wajib diisi untuk Tempo", path: ["dueDate"] });
    if (!data.customerName || data.customerName === "Walk In") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nama customer wajib untuk Tempo", path: ["customerName"] });
  }
});
export type PenjualanInput = z.infer<typeof penjualanSchema>;
