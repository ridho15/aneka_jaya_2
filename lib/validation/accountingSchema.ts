import { z } from "zod";

export const accountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode akun wajib diisi")
    .max(30)
    .regex(/^[0-9]+(-[0-9]+)*$/, "Format kode akun harus berupa angka atau dipisah tanda hubung (misal: 1-1001)"),
  name: z.string().trim().min(1, "Nama akun wajib diisi").max(120),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"], {
    errorMap: () => ({ message: "Kategori akun harus Aset, Kewajiban, Ekuitas, Pendapatan, atau Beban" })
  }),
  normalBalance: z.enum(["DEBIT", "CREDIT"], {
    errorMap: () => ({ message: "Saldo normal harus Debit atau Kredit" })
  }),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true)
});
export type AccountInput = z.infer<typeof accountSchema>;

export const manualJournalLineSchema = z.object({
  accountId: z.string().trim().min(1, "Akun perkiraan wajib dipilih"),
  debit: z.coerce.number().min(0, "Nominal debit tidak boleh negatif").default(0),
  credit: z.coerce.number().min(0, "Nominal kredit tidak boleh negatif").default(0),
  memo: z.string().trim().max(255).optional().or(z.literal(""))
});

export const manualJournalSchema = z
  .object({
    entryDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "Tanggal jurnal tidak valid"),
    tipeId: z.string().trim().optional().or(z.literal("")),
    description: z.string().trim().min(1, "Keterangan jurnal wajib diisi").max(500),
    attachmentUrl: z
      .string()
      .refine((val) => !val || val.startsWith("/") || /^https?:\/\//i.test(val), "URL lampiran tidak valid")
      .optional()
      .or(z.literal("")),
    lines: z.array(manualJournalLineSchema).min(2, "Jurnal minimal harus memiliki 2 baris entri")
  })
  .refine(
    (data) => {
      const totalDebit = data.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
      const totalCredit = data.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
      return Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
    },
    {
      message: "Total Debit harus sama persis dengan Total Kredit (jurnal harus seimbang) dan lebih dari 0.",
      path: ["lines"]
    }
  );
export type ManualJournalInput = z.infer<typeof manualJournalSchema>;

export const periodClosingSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/, "Format periode harus YYYY-MM (misal: 2026-10)"),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});
export type PeriodClosingInput = z.infer<typeof periodClosingSchema>;
