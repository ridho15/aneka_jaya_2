import { z } from "zod";

export const barangSchema = z.object({
  code: z.string().trim().min(1, "Kode barang wajib diisi").max(80),
  name: z.string().trim().min(1, "Nama barang wajib diisi").max(150),
  category: z.string().trim().min(1, "Kategori wajib diisi").max(100),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(30),
  sellingPrice: z.coerce.number().min(0, "Harga jual tidak boleh negatif"),
  costPrice: z.coerce.number().min(0, "Harga modal tidak boleh negatif"),
  brand: z.string().trim().max(100).optional(),
  initialStock: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Stok awal tidak boleh negatif").default(0)),
  minimumStock: z.preprocess((value) => value === "" || Number.isNaN(value) ? 0 : value, z.coerce.number().min(0, "Minimum stock tidak boleh negatif").default(0)),
  warehouse: z.preprocess((value) => !String(value ?? "").trim() ? "Toko" : value, z.string().trim().max(100)),
  rack: z.string().trim().max(100).optional(),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().trim().max(1000).optional()
});
export type BarangInput = z.infer<typeof barangSchema>;
