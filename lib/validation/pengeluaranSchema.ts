import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  { code: "operational_expense", label: "Beban operasional" },
  { code: "goods_purchase", label: "Pembelian barang" },
  { code: "employee_loan", label: "Kasbon pribadi" },
  { code: "operational_advance", label: "Uang muka operasional" },
  { code: "salary", label: "Gaji" }
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORIES)[number]["code"];

export function labelForCategoryCode(code: string): string {
  const found = EXPENSE_CATEGORIES.find((item) => item.code === code);
  return found ? found.label : "Beban operasional";
}

export const pengeluaranSchema = z.object({
  expenseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal pengeluaran tidak valid"),
  tipeId: z.string().trim().min(1, "Tipe wajib dipilih").default("W"),
  tipeCodeSnapshot: z.string().trim().default("W"),
  tipeNameSnapshot: z.string().trim().default("W"),
  rekeningId: z.string().trim().min(1, "Rekening pembayaran wajib dipilih"),
  rekeningNameSnapshot: z.string().trim().min(1, "Rekening pembayaran wajib dipilih"),
  coaId: z.string().trim().min(1, "COA wajib dipilih").default("Kas"),
  coaNameSnapshot: z.string().trim().min(1, "COA wajib dipilih").default("Kas"),
  category: z.string().trim().max(100).default("Beban operasional"),
  categoryCode: z.enum(["operational_expense", "goods_purchase", "employee_loan", "operational_advance", "salary"]).default("operational_expense"),
  employeeId: z.string().trim().optional().or(z.literal("")),
  salaryPeriod: z.string().trim().regex(/^\d{4}-\d{2}$/, "Format periode gaji harus YYYY-MM").optional().or(z.literal("")),
  salaryPaymentType: z.enum(["EXPENSE", "PAYABLE"]).default("EXPENSE"),
  dueDate: z.string().optional().or(z.literal("")),
  purpose: z.string().trim().max(500).optional().or(z.literal("")),
  vendorName: z.string().trim().min(1, "Nama vendor atau penerima wajib diisi").max(150),
  description: z.string().trim().min(1, "Deskripsi wajib diisi").max(1000),
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.string().trim().min(1, "Metode pembayaran wajib diisi").max(80),
  attachmentUrl: z.string().refine((value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value), "URL lampiran tidak valid").optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional()
}).superRefine((data, ctx) => {
  if (data.categoryCode === "employee_loan") {
    if (!data.employeeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Karyawan wajib dipilih untuk kasbon pribadi.", path: ["employeeId"] });
    }
    if (!data.purpose) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tujuan kasbon wajib diisi.", path: ["purpose"] });
    }
  }
  if (data.categoryCode === "operational_advance") {
    if (!data.employeeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Karyawan penerima wajib dipilih untuk uang muka operasional.", path: ["employeeId"] });
    }
    if (!data.purpose) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tujuan uang muka wajib diisi.", path: ["purpose"] });
    }
  }
  if (data.categoryCode === "salary") {
    if (!data.employeeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Karyawan wajib dipilih untuk pembayaran gaji.", path: ["employeeId"] });
    }
    if (!data.salaryPeriod) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Periode bulan gaji (format YYYY-MM) wajib diisi.", path: ["salaryPeriod"] });
    }
  }
});

export type PengeluaranInput = z.infer<typeof pengeluaranSchema>;
