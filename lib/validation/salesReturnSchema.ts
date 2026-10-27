import { z } from "zod";

export const SalesReturnRefundMethodEnum = z.enum(["REDUCE_RECEIVABLE", "REFUND_CASH"]);
export const SalesReturnStatusEnum = z.enum(["DRAFT", "POSTED", "CANCELLED"]);

export const SalesReturnItemSchema = z.object({
  salesRecordItemId: z.string().optional().nullable(),
  productRef: z.string().min(1, "SKU / Referensi produk wajib diisi"),
  productName: z.string().min(1, "Nama produk wajib diisi"),
  unit: z.string().default("PCS"),
  quantity: z.number().positive("Kuantitas retur harus lebih besar dari 0"),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
  unitCostPrice: z.number().min(0, "Harga modal tidak boleh negatif").default(0),
  reason: z.string().optional().nullable()
});

export type SalesReturnItemInput = z.infer<typeof SalesReturnItemSchema>;

export const SalesReturnSchema = z.object({
  returnNumber: z.string().optional().nullable(),
  salesRecordId: z.string().min(1, "ID transaksi penjualan wajib dipilih"),
  returnDate: z.string().or(z.date()),
  customerName: z.string().min(1, "Nama pelanggan wajib diisi"),
  refundMethod: SalesReturnRefundMethodEnum.default("REDUCE_RECEIVABLE"),
  rekeningAccountId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(SalesReturnItemSchema).min(1, "Minimal harus ada 1 item barang yang diretur")
});

export type SalesReturnInput = z.infer<typeof SalesReturnSchema>;
