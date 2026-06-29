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
  tipeIds: z.array(z.string().trim().min(1).max(80)).optional()
}).transform((value) => ({
  bank: value.bank,
  name: value.name,
  accountNumber: value.accountNumber || "-",
  tipeIds: value.tipeIds || []
}));

export const rekeningUpdateSchema = z.object({
  id: cleanString(80),
  bank: cleanString(80).optional(),
  name: cleanString(100).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  isActive: z.boolean().optional(),
  tipeIds: z.array(z.string().trim().min(1).max(80)).optional()
});

export function validationMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || fallback;
  return fallback;
}
