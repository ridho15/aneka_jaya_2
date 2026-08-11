import { z } from "zod";

const money = z.number().finite().nonnegative().multipleOf(0.01);
const positiveId = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String);

const accountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("slm"), rekening_id: z.string().min(1) }).strict(),
  z.object({ mode: z.literal("manual"), aj_coa_reference: z.string().min(1), name: z.string().min(1).optional() }).strict()
]);

const customerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), customer_id: positiveId, name: z.string().min(1).optional() }).strict(),
  z.object({ mode: z.literal("manual"), external_id: z.string().min(1).max(150), name: z.string().min(1).max(200), address: z.string().min(1).max(500) }).strict()
]);

const itemSchema = z.object({
  external_product_id: positiveId,
  product_name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(100).optional(),
  warehouse_id: positiveId,
  rack_id: positiveId.optional(),
  quantity: z.number().finite().positive().multipleOf(0.01),
  unit_price: money,
  discount: money.default(0),
  subtotal: money
}).strict().superRefine((item, context) => {
  const expected = roundMoney(item.quantity * item.unit_price - item.discount);
  if (item.subtotal !== expected) context.addIssue({ code: "custom", path: ["subtotal"], message: `subtotal harus ${expected}` });
});

export const mjInvoiceSchema = z.object({
  source: z.literal("MJ"),
  external_reference: z.string().min(1).max(150),
  invoice_reference: z.string().min(1).max(100),
  invoice_date: z.string().date(),
  currency: z.literal("IDR"),
  bookkeeping_type_code: z.string().min(1).max(50),
  customer: customerSchema,
  payment: z.object({
    method: z.enum(["Cash", "TF", "Tempo"]),
    status: z.enum(["paid", "partial", "unpaid"]),
    paid_amount: money,
    due_date: z.string().date().optional(),
    account: accountSchema.optional()
  }).strict(),
  items: z.array(itemSchema).min(1).max(500),
  subtotal: money,
  discount: money.default(0),
  total: money,
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional()
}).strict().superRefine((payload, context) => {
  const itemSubtotal = roundMoney(payload.items.reduce((sum, item) => sum + item.subtotal, 0));
  if (payload.subtotal !== itemSubtotal) context.addIssue({ code: "custom", path: ["subtotal"], message: `subtotal invoice harus ${itemSubtotal}` });
  const expectedTotal = roundMoney(payload.subtotal - payload.discount);
  if (payload.total !== expectedTotal) context.addIssue({ code: "custom", path: ["total"], message: `total harus ${expectedTotal}` });
  const immediate = payload.payment.method === "Cash" || payload.payment.method === "TF";
  if (immediate && payload.payment.status !== "paid") context.addIssue({ code: "custom", path: ["payment", "status"], message: "Cash/TF wajib berstatus paid" });
  if (immediate && payload.payment.paid_amount !== payload.total) context.addIssue({ code: "custom", path: ["payment", "paid_amount"], message: "paid_amount Cash/TF harus sama dengan total" });
  if (immediate && !payload.payment.account) context.addIssue({ code: "custom", path: ["payment", "account"], message: "rekening Cash/TF wajib diisi" });
  if (payload.payment.method === "Tempo" && !payload.payment.due_date) context.addIssue({ code: "custom", path: ["payment", "due_date"], message: "due_date Tempo wajib diisi" });
  if (payload.payment.method === "Tempo" && payload.payment.paid_amount > payload.total) context.addIssue({ code: "custom", path: ["payment", "paid_amount"], message: "paid_amount tidak boleh melebihi total" });
  if (payload.payment.paid_amount > 0 && !payload.payment.account) context.addIssue({ code: "custom", path: ["payment", "account"], message: "rekening wajib untuk pembayaran lebih dari nol" });
  if (payload.payment.due_date && payload.payment.due_date < payload.invoice_date) context.addIssue({ code: "custom", path: ["payment", "due_date"], message: "due_date tidak boleh sebelum invoice_date" });
});

export const mjTempoPaymentSchema = z.object({
  payment_reference: z.string().min(1).max(150),
  payment_date: z.string().date(),
  amount: z.number().finite().positive().multipleOf(0.01),
  payment_method: z.enum(["Cash", "TF", "Other"]),
  account: accountSchema,
  notes: z.string().max(1000).optional()
}).strict();

export type MjInvoiceInput = z.infer<typeof mjInvoiceSchema>;
export type MjTempoPaymentInput = z.infer<typeof mjTempoPaymentSchema>;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
