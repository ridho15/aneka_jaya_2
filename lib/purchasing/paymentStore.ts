import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PurchasePaymentInput } from "@/lib/validation/purchasingSchema";
import { recordAudit } from "@/lib/audit/store";
import { postPurchasePaymentJournal, type PurchasingActor } from "@/lib/purchasing/postingHooks";

export async function generatePaymentNumber(): Promise<string> {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PAY-PUR-${yearMonth}-`;

  if (typeof prisma?.purchasePayment?.count !== "function") {
    return `${prefix}0001`;
  }

  const count = await prisma.purchasePayment.count({
    where: { paymentNumber: { startsWith: prefix } }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function calculateForexPreview(params: {
  invoiceId: string;
  amountPaidOriginal: number;
  paymentRate: number;
}) {
  if (typeof prisma?.purchaseInvoice?.findUnique !== "function") {
    return null;
  }

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: params.invoiceId }
  });
  if (!invoice) throw new Error("Invoice tidak ditemukan.");

  const invoiceRate = Number(invoice.exchangeRate);
  const settledPayableIdr = Math.round(params.amountPaidOriginal * invoiceRate);
  const totalPaidIdr = Math.round(params.amountPaidOriginal * params.paymentRate);
  const forexDiffIdr = settledPayableIdr - totalPaidIdr;

  return {
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    amountPaidOriginal: params.amountPaidOriginal,
    invoiceRate,
    paymentRate: params.paymentRate,
    settledPayableIdr,
    totalPaidIdr,
    forexDiffIdr,
    isGain: forexDiffIdr > 0,
    isLoss: forexDiffIdr < 0,
    forexAccountCode: forexDiffIdr >= 0 ? "4-1002" : "6-1006",
    forexAccountName:
      forexDiffIdr >= 0
        ? "4-1002 Pendapatan Selisih Kurs"
        : "6-1006 Kerugian Selisih Kurs"
  };
}

export async function createPurchasePayment(
  input: PurchasePaymentInput,
  actor: PurchasingActor
) {
  if (typeof prisma?.purchasePayment?.create !== "function") return null;

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: input.purchaseInvoiceId },
    include: { supplier: true }
  });
  if (!invoice) throw new Error("Invoice pembelian tidak ditemukan.");

  if (invoice.status !== "POSTED" && invoice.status !== "PARTIAL_PAID") {
    throw new Error(
      `Pembayaran hanya dapat dilakukan untuk invoice berstatus POSTED atau PARTIAL_PAID. Status saat ini: ${invoice.status}`
    );
  }

  const rekening = await prisma.rekeningAccount.findUnique({
    where: { id: input.rekeningAccountId }
  });
  if (!rekening) throw new Error("Rekening sumber pembayaran tidak ditemukan.");
  if (!rekening.isActive) throw new Error("Rekening sumber pembayaran non-aktif.");

  const rekeningCurrency = (rekening.currency || "IDR").toUpperCase();
  const invoiceCurrency = (invoice.currency || "IDR").toUpperCase();

  // Validasi multi-currency:
  if (invoiceCurrency === "IDR" && rekeningCurrency !== "IDR") {
    throw new Error(
      `Faktur IDR hanya dapat dibayar menggunakan rekening IDR. Rekening ${rekening.name} bermata uang ${rekeningCurrency}.`
    );
  }

  if (invoiceCurrency !== "IDR" && rekeningCurrency !== invoiceCurrency && rekeningCurrency !== "IDR") {
    throw new Error(
      `Rekening ${rekening.name} (${rekeningCurrency}) tidak dapat dipilih untuk tagihan ${invoiceCurrency} tanpa konversi eksplisit. Gunakan rekening ${invoiceCurrency} atau rekening IDR.`
    );
  }

  const remainingOriginal =
    Number(invoice.totalAmountOriginal) - Number(invoice.totalPaidOriginal);
  if (input.amountPaidOriginal > remainingOriginal + 0.01) {
    throw new Error(
      `Jumlah pembayaran (${input.amountPaidOriginal.toFixed(2)}) melebihi sisa tagihan (${remainingOriginal.toFixed(2)}).`
    );
  }

  const invoiceRate = Number(invoice.exchangeRate);
  const settledPayableIdr = Math.round(input.amountPaidOriginal * invoiceRate);
  const totalPaidIdr = Math.round(input.amountPaidOriginal * input.paymentRate);
  const forexDiffIdr = settledPayableIdr - totalPaidIdr;
  const forexAccountCode = forexDiffIdr >= 0 ? "4-1002" : "6-1006";

  const paymentNumber = input.paymentNumber?.trim() || (await generatePaymentNumber());

  const payment = await prisma.purchasePayment.create({
    data: {
      paymentNumber,
      purchaseInvoiceId: invoice.id,
      supplierId: invoice.supplierId,
      paymentDate: new Date(input.paymentDate),
      rekeningAccountId: rekening.id,
      currency: invoice.currency,
      amountPaidOriginal: input.amountPaidOriginal,
      paymentRate: input.paymentRate,
      invoiceRate,
      settledPayableIdr,
      totalPaidIdr,
      forexDiffIdr,
      forexAccountCode,
      notes: input.notes || null,
      createdByUserId: actor.id,
      createdByNameSnapshot: actor.name
    },
    include: {
      supplier: true,
      purchaseInvoice: true,
      rekeningAccount: true
    }
  });

  // Automatically post payment journal with realized forex difference
  await postPurchasePaymentJournal(payment.id, actor);

  // Update invoice totalPaid and status
  const newTotalPaidOriginal =
    Number(invoice.totalPaidOriginal) + input.amountPaidOriginal;
  const newTotalPaidIdr = Number(invoice.totalPaidIdr) + totalPaidIdr;
  const isFullyPaid =
    newTotalPaidOriginal >= Number(invoice.totalAmountOriginal) - 0.001;

  await prisma.purchaseInvoice.update({
    where: { id: invoice.id },
    data: {
      totalPaidOriginal: newTotalPaidOriginal,
      totalPaidIdr: newTotalPaidIdr,
      status: isFullyPaid ? "PAID" : "PARTIAL_PAID"
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: payment.id,
    action: "create",
    afterValue: payment,
    reason: `Bayar utang valas ${invoice.currency} ${input.amountPaidOriginal} (Kurs ${input.paymentRate}) - Selisih Kurs: Rp ${forexDiffIdr.toLocaleString("id-ID")}`
  });

  return payment;
}

export async function listPurchasePayments(params?: {
  supplierId?: string;
  purchaseInvoiceId?: string;
}) {
  if (typeof prisma?.purchasePayment?.findMany !== "function") return [];

  const where: any = {};
  if (params?.supplierId) where.supplierId = params.supplierId;
  if (params?.purchaseInvoiceId) where.purchaseInvoiceId = params.purchaseInvoiceId;

  return prisma.purchasePayment.findMany({
    where,
    include: {
      supplier: true,
      purchaseInvoice: true,
      rekeningAccount: true,
      journalEntry: {
        include: { lines: true }
      }
    },
    orderBy: { paymentDate: "desc" }
  });
}
