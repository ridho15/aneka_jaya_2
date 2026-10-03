import { z } from "zod";

export const tempoPaymentSchema = z.object({
  paymentDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal pembayaran tidak valid"),
  amountPaid: z.coerce.number().finite("Nominal dibayar tidak valid").positive("Nominal dibayar harus lebih dari 0."),
  paymentMethod: z.enum(["Cash", "TF", "Other"]).default("Cash"),
  rekeningId: z.string().trim().min(1, "Rekening penerima wajib dipilih."),
  attachmentUrl: z.string().refine((value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value), "URL lampiran tidak valid").optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional()
});

export const tempoActionSchema = z.object({
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter.").max(1000)
});

export type TempoPaymentInput = z.infer<typeof tempoPaymentSchema>;
export type TempoActionInput = z.infer<typeof tempoActionSchema>;
