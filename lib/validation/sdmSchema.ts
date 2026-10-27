import { z } from "zod";

export const employeeSchema = z.object({
  nik: z.string().trim().max(50).nullish().or(z.literal("")),
  name: z.string().trim().min(1, "Nama karyawan wajib diisi").max(120),
  position: z.string().trim().min(1, "Jabatan wajib diisi").max(100),
  department: z.string().trim().min(1, "Departemen wajib diisi").max(100),
  managerId: z.string().trim().nullish().or(z.literal("")),
  isActive: z.boolean().default(true),
  bankName: z.string().trim().max(80).nullish().or(z.literal("")),
  bankAccountNumber: z.string().trim().max(80).nullish().or(z.literal("")),
  notes: z.string().trim().max(500).nullish().or(z.literal(""))
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const loanRepaymentSchema = z.object({
  loanId: z.string().trim().min(1, "ID pinjaman/kasbon wajib diisi"),
  paymentDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "Tanggal pelunasan tidak valid"),
  amount: z.coerce.number().positive("Jumlah pelunasan harus lebih dari 0"),
  paymentMethod: z.enum(["TRANSFER", "CASH", "POTONG_GAJI"], {
    errorMap: () => ({ message: "Metode pembayaran harus Transfer, Tunai, atau Potong Gaji" })
  }),
  rekeningId: z.string().trim().nullish().or(z.literal("")),
  rekeningNameSnapshot: z.string().trim().nullish().or(z.literal("")),
  payrollReference: z.string().trim().max(200).nullish().or(z.literal("")),
  notes: z.string().trim().max(1000).nullish().or(z.literal("")),
  attachmentUrl: z.string().refine((val) => !val || val.startsWith("/") || /^https?:\/\//i.test(val), "URL lampiran tidak valid").nullish().or(z.literal(""))
}).refine((data) => {
  if (data.paymentMethod === "POTONG_GAJI" && !data.payrollReference && !data.notes) {
    return false;
  }
  return true;
}, {
  message: "Pelunasan via potong gaji wajib mencantumkan referensi otorisasi tertulis atau catatan payroll.",
  path: ["payrollReference"]
}).refine((data) => {
  if ((data.paymentMethod === "TRANSFER" || data.paymentMethod === "CASH") && !data.rekeningId) {
    return false;
  }
  return true;
}, {
  message: "Rekening penerima wajib dipilih untuk pelunasan via Transfer atau Tunai.",
  path: ["rekeningId"]
});
export type LoanRepaymentInput = z.infer<typeof loanRepaymentSchema>;

export const advanceSettlementSchema = z.object({
  loanId: z.string().trim().min(1, "ID uang muka wajib diisi"),
  settlementDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "Tanggal pertanggungjawaban tidak valid"),
  actualExpenseAmount: z.coerce.number().min(0, "Biaya sebenarnya tidak boleh negatif"),
  refundAmount: z.coerce.number().min(0, "Jumlah pengembalian tidak boleh negatif").default(0),
  refundRekeningId: z.string().trim().nullish().or(z.literal("")),
  refundRekeningSnapshot: z.string().trim().nullish().or(z.literal("")),
  notes: z.string().trim().max(1000).nullish().or(z.literal("")),
  attachmentUrl: z.string().refine((val) => !val || val.startsWith("/") || /^https?:\/\//i.test(val), "URL bukti lampiran tidak valid").nullish().or(z.literal(""))
});
export type AdvanceSettlementInput = z.infer<typeof advanceSettlementSchema>;
