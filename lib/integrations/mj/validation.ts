import { z } from "zod";

export const MJ_PROCESSING_MODES = ["slm_process_aj", "aj_already_processed", "record_only"] as const;
export type MjProcessingMode = typeof MJ_PROCESSING_MODES[number];

const money = z.number().finite().nonnegative().multipleOf(0.01);
const positiveId = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String);

const ajAccountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("slm"), rekening_id: z.string().min(1).optional(), name: z.string().optional() }).passthrough(),
  z.object({ mode: z.literal("manual"), aj_coa_reference: z.string().optional(), account_reference: z.string().optional(), name: z.string().optional(), bank: z.string().optional(), bank_name: z.string().optional() }).passthrough()
]);

const localAccountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("slm"), rekening_id: z.string().min(1).optional(), name: z.string().optional() }).passthrough(),
  z.object({ mode: z.literal("manual"), account_reference: z.string().optional(), aj_coa_reference: z.string().optional(), name: z.string().optional(), bank: z.string().optional(), bank_name: z.string().optional() }).passthrough()
]);

const customerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), customer_id: positiveId, name: z.string().min(1).optional() }).passthrough(),
  z.object({ mode: z.literal("manual"), external_id: z.string().min(1).max(150), name: z.string().min(1).max(200), address: z.string().max(500).optional().default("-") }).passthrough()
]);

const ajItemSchema = z.object({
  external_product_id: positiveId,
  product_name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(100).optional(),
  warehouse_id: positiveId,
  warehouse_name: z.string().min(1).max(200).optional(),
  rack_id: positiveId.optional(),
  rack_name: z.string().min(1).max(200).optional(),
  quantity: z.number().finite().positive().multipleOf(0.01),
  unit_price: money,
  discount: money.default(0),
  subtotal: money
}).passthrough();

const localItemSchema = z.object({
  product_reference: z.string().min(1).max(150),
  product_name: z.string().min(1).max(200),
  external_product_id: positiveId.optional(),
  warehouse_id: positiveId.optional(),
  warehouse_name: z.string().min(1).max(200).optional(),
  rack_id: positiveId.optional(),
  rack_name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  quantity: z.number().finite().positive().multipleOf(0.01),
  unit_price: money,
  discount: money.default(0),
  subtotal: money
}).passthrough();

function paymentSchema(account: typeof ajAccountSchema | typeof localAccountSchema) {
  return z.object({
    method: z.enum(["Cash", "TF", "Tempo", "Other", "Transfer"]),
    status: z.enum(["paid", "partial", "unpaid"]),
    paid_amount: money,
    due_date: z.string().date().optional(),
    account: account.optional()
  }).passthrough();
}

const common = {
  source: z.literal("MJ"),
  external_reference: z.string().min(1).max(150),
  invoice_reference: z.string().min(1).max(100),
  invoice_date: z.string().date(),
  currency: z.literal("IDR"),
  bookkeeping_type_code: z.string().min(1).max(50),
  customer: customerSchema,
  subtotal: money,
  discount: money.default(0),
  total: money,
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional()
};

const slmProcessAjSchema = z.object({
  ...common,
  processing_mode: z.literal("slm_process_aj"),
  payment: paymentSchema(ajAccountSchema),
  items: z.array(ajItemSchema).min(1).max(500)
}).strict();

const ajAlreadyProcessedSchema = z.object({
  ...common,
  processing_mode: z.literal("aj_already_processed"),
  aj_invoice_number: z.string().min(1).max(100),
  aj_invoice_id: positiveId.optional(),
  aj_customer_id: positiveId,
  payment: paymentSchema(ajAccountSchema),
  items: z.array(ajItemSchema).min(1).max(500)
}).strict();

const recordOnlySchema = z.object({
  ...common,
  processing_mode: z.literal("record_only"),
  payment: paymentSchema(localAccountSchema),
  items: z.array(localItemSchema).min(1).max(500)
}).strict();

export const mjInvoiceSchema = z.discriminatedUnion("processing_mode", [slmProcessAjSchema, ajAlreadyProcessedSchema, recordOnlySchema]).superRefine((payload, context) => {
  payload.items.forEach((item, index) => {
    const expected = roundMoney(item.quantity * item.unit_price - item.discount);
    if (item.subtotal !== expected) context.addIssue({ code: "custom", path: ["items", index, "subtotal"], message: `subtotal harus ${expected}` });
  });
  const itemSubtotal = roundMoney(payload.items.reduce((sum, item) => sum + item.subtotal, 0));
  if (payload.subtotal !== itemSubtotal) context.addIssue({ code: "custom", path: ["subtotal"], message: `subtotal invoice harus ${itemSubtotal}` });
  const expectedTotal = roundMoney(payload.subtotal - payload.discount);
  if (payload.total !== expectedTotal) context.addIssue({ code: "custom", path: ["total"], message: `total harus ${expectedTotal}` });
  const immediate = payload.payment.method === "Cash" || payload.payment.method === "TF" || payload.payment.method === "Transfer";
  if (immediate && payload.payment.status !== "paid") context.addIssue({ code: "custom", path: ["payment", "status"], message: "Cash/TF/Transfer wajib berstatus paid" });
  if (immediate && payload.payment.paid_amount !== payload.total) context.addIssue({ code: "custom", path: ["payment", "paid_amount"], message: "paid_amount Cash/TF/Transfer harus sama dengan total" });
  if (immediate && !payload.payment.account) context.addIssue({ code: "custom", path: ["payment", "account"], message: "rekening Cash/TF/Transfer wajib diisi" });
  if (payload.payment.method === "Tempo" && !payload.payment.due_date) context.addIssue({ code: "custom", path: ["payment", "due_date"], message: "due_date Tempo wajib diisi" });
  if (payload.payment.method === "Tempo" && payload.payment.paid_amount > payload.total) context.addIssue({ code: "custom", path: ["payment", "paid_amount"], message: "paid_amount tidak boleh melebihi total" });
  if (payload.payment.paid_amount > 0 && !payload.payment.account) context.addIssue({ code: "custom", path: ["payment", "account"], message: "rekening wajib untuk pembayaran lebih dari nol" });
  if (payload.payment.due_date && payload.payment.due_date < payload.invoice_date) context.addIssue({ code: "custom", path: ["payment", "due_date"], message: "due_date tidak boleh sebelum invoice_date" });
  if (payload.processing_mode === "aj_already_processed") {
    if (payload.external_reference !== payload.invoice_reference) context.addIssue({ code: "custom", path: ["external_reference"], message: "external_reference dan invoice_reference wajib sama" });
    if (payload.aj_invoice_number !== payload.invoice_reference) context.addIssue({ code: "custom", path: ["aj_invoice_number"], message: "aj_invoice_number dan invoice_reference wajib sama" });
  }
});

export const mjTempoPaymentSchema = z.object({
  payment_reference: z.string().min(1).max(150),
  payment_date: z.string().date(),
  amount: z.number().finite().positive().multipleOf(0.01),
  payment_method: z.enum(["Cash", "TF", "Other"]),
  account: z.union([ajAccountSchema, localAccountSchema]),
  notes: z.string().max(1000).optional()
}).strict();

export const mjCancelSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export const mjPrintEventSchema = z.object({
  printed_at: z.string().datetime({ offset: true }).or(z.string()).optional(),
  printed_by: z.string().max(200).optional(),
  print_count: z.number().int().positive().optional(),
  printer_name: z.string().max(200).optional(),
  format: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional()
}).passthrough();

export type MjInvoiceInput = z.infer<typeof mjInvoiceSchema>;
export type MjAjInvoiceInput = Extract<MjInvoiceInput, { processing_mode: "slm_process_aj" | "aj_already_processed" }>;
export type MjTempoPaymentInput = z.infer<typeof mjTempoPaymentSchema>;
export type MjPrintEventInput = z.infer<typeof mjPrintEventSchema>;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
