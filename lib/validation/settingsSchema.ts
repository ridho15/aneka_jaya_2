import { z } from "zod";

const cleanString = (max: number) => z.string().trim().min(1).max(max);

export const tipeCreateSchema = z.object({
  code: cleanString(20).transform((value) => value.toUpperCase()),
  name: z.string().trim().max(80).optional()
}).transform((value) => ({
  code: value.code,
  name: value.name || value.code
}));

export const tipeUpdateSchema = z.object({
  id: cleanString(80),
  code: cleanString(20).transform((value) => value.toUpperCase()).optional(),
  name: cleanString(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
});

export const rekeningCreateSchema = z.object({
  bank: cleanString(80),
  name: cleanString(100),
  accountNumber: z.string().trim().max(80).optional(),
  erpCoaId: z.string().trim().max(80).optional(),
  erpCoaNameSnapshot: z.string().trim().max(120).optional(),
  tipeIds: z.array(z.string().trim().min(1).max(80)).optional(),
  currency: z.string().trim().min(2).max(10).optional(),
  openingBalanceValas: z.number().min(0).optional(),
  openingBalanceDate: z.string().optional(),
  openingRate: z.number().positive().optional()
}).transform((value) => ({
  bank: value.bank,
  name: value.name,
  accountNumber: value.accountNumber || "-",
  erpCoaId: value.erpCoaId || undefined,
  erpCoaNameSnapshot: value.erpCoaNameSnapshot || undefined,
  tipeIds: value.tipeIds || [],
  currency: value.currency?.toUpperCase() || "IDR",
  openingBalanceValas: value.openingBalanceValas || 0,
  openingBalanceDate: value.openingBalanceDate || undefined,
  openingRate: value.openingRate || 1
}));

export const rekeningUpdateSchema = z.object({
  id: cleanString(80),
  bank: cleanString(80).optional(),
  name: cleanString(100).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  erpCoaId: z.string().trim().max(80).optional(),
  erpCoaNameSnapshot: z.string().trim().max(120).optional(),
  isActive: z.boolean().optional(),
  tipeIds: z.array(z.string().trim().min(1).max(80)).optional(),
  currency: z.string().trim().min(2).max(10).optional(),
  openingBalanceValas: z.number().min(0).optional(),
  openingBalanceDate: z.string().optional(),
  openingRate: z.number().positive().optional()
});

const phoneRegex = /^\+?[0-9]{8,16}$/;

export const whatsappRecipientCreateSchema = z.object({
  name: cleanString(100),
  phoneNumber: z.string().trim().regex(phoneRegex, "Nomor WhatsApp harus berupa angka 8-16 digit."),
  isActive: z.boolean().optional(),
  receivesDailyReport: z.boolean().optional(),
  receivesStockAlert: z.boolean().optional(),
  receivesTempoReminder: z.boolean().optional()
});

export const whatsappRecipientUpdateSchema = whatsappRecipientCreateSchema.partial().extend({
  id: cleanString(80)
});

export const operationalProfitSettingSchema = z.object({
  grossProfitPercent: z.coerce.number().min(0, "Persentase tidak boleh kurang dari 0.").max(100, "Persentase tidak boleh lebih dari 100.")
});

export const erpSyncSettingSchema = z.object({
  autoSyncAfterSalesEdit: z.boolean().optional(),
  erpTransactionSyncEnabled: z.boolean().optional(),
  mjTransactionMode: z.enum(["disabled", "record_only", "process_aj"]).optional()
});

export const slmProfitSettingSchema = operationalProfitSettingSchema;

export function validationMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || fallback;
  return fallback;
}
