import { z } from "zod";

export const stockAdjustmentSchema = z.object({
  adjustmentNumber: z.string().trim().max(255).optional(),
  adjustmentDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal adjustment tidak valid").optional(),
  warehouseId: z.coerce.number().int().positive("Gudang wajib dipilih"),
  adjustmentType: z.enum(["increase", "decrease"]),
  reason: z.string().trim().min(3, "Alasan adjustment wajib diisi").max(1000),
  notes: z.string().trim().max(2000).optional(),
  createdBy: z.coerce.number().int().positive().optional(),
  approvedBy: z.coerce.number().int().positive().optional(),
  approveNow: z.boolean().default(true),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive("Produk wajib dipilih"),
    rakId: z.coerce.number().int().positive("Rak wajib dipilih"),
    currentQty: z.coerce.number().optional(),
    adjustedQty: z.coerce.number().optional(),
    differenceQty: z.coerce.number().refine((value) => value !== 0, "Selisih stok tidak boleh 0"),
    unitCost: z.coerce.number().min(0).optional(),
    differenceValue: z.coerce.number().optional(),
    notes: z.string().trim().max(1000).optional()
  })).min(1, "Minimal satu item adjustment diperlukan")
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
