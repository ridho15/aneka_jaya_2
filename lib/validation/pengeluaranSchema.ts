import { z } from "zod";

export const pengeluaranSchema = z.object({
  expenseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal pengeluaran tidak valid"),
  tipeId: z.string().trim().min(1, "Tipe wajib dipilih").default("W"),
  tipeCodeSnapshot: z.string().trim().default("W"),
  tipeNameSnapshot: z.string().trim().default("W"),
  rekeningId: z.string().trim().min(1, "Rekening pembayaran wajib dipilih"),
  rekeningNameSnapshot: z.string().trim().min(1, "Rekening pembayaran wajib dipilih"),
  coaId: z.string().trim().min(1, "COA wajib dipilih").default("Kas"),
  coaNameSnapshot: z.string().trim().min(1, "COA wajib dipilih").default("Kas"),
  category: z.string().trim().min(1, "Kategori wajib diisi").max(100),
  vendorName: z.string().trim().min(1, "Nama vendor atau penerima wajib diisi").max(150),
  description: z.string().trim().min(1, "Deskripsi wajib diisi").max(1000),
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.string().trim().min(1, "Metode pembayaran wajib diisi").max(80),
  attachmentUrl: z.string().url("URL lampiran tidak valid").optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional()
});
export type PengeluaranInput = z.infer<typeof pengeluaranSchema>;
