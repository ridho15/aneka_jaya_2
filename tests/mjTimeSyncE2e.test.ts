import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEnvFiles } from "@/scripts/load-env.mjs";
loadEnvFiles();

import { prisma } from "@/lib/db/prisma";
import { createOrResumeMjInvoice } from "@/lib/integrations/mj/service";
import { formatJakartaDateTime, formatJakartaDateTimeCompact } from "@/lib/date/jakarta";

const principal = {
  clientId: "6ee24610-03e9-4948-8cf8-97d2a5216c4f",
  clientCode: "mj-sandbox",
  environment: "sandbox" as const,
  name: "MJ Sandbox Client",
  role: "OWNER" as const,
  permissions: ["integrations.mj.manage", "penjualan.create", "reports.view"]
};

describe("E2E Live Verification: MJ to SLM Date and Time Sync", () => {
  it("1. Saves exact transactionAt when transaction_at is provided (14:35:20 WIB)", async () => {
    // 14:35:20 WIB = 07:35:20 UTC
    const testTimeIso = "2026-09-06T07:35:20.000Z";
    const externalRef = `MJ-TIME-TEST-${Date.now()}`;

    const payload = {
      source: "MJ" as const,
      processing_mode: "record_only" as const,
      external_reference: externalRef,
      invoice_reference: `INV-${externalRef}`,
      invoice_date: "2026-09-06",
      transaction_at: testTimeIso,
      currency: "IDR" as const,
      bookkeeping_type_code: "SLM",
      customer: {
        mode: "manual" as const,
        external_id: "MJ-CUST-TIME",
        name: "Toko Harapan Baru (Test Waktu)",
        address: "Jl. Hayam Wuruk No. 12"
      },
      payment: {
        method: "Cash" as const,
        status: "paid" as const,
        paid_amount: 150000,
        account: {
          mode: "manual" as const,
          account_reference: "CASH-MJ",
          name: "Kas MJ"
        }
      },
      items: [
        {
          product_reference: "AMJ01-1",
          product_name: "Barang Test Waktu",
          unit: "Pcs",
          quantity: 2,
          unit_price: 75000,
          discount: 0,
          subtotal: 150000
        }
      ],
      subtotal: 150000,
      discount: 0,
      total: 150000
    };

    const res = await createOrResumeMjInvoice(payload, principal);
    expect(res.status).toBe("created");

    const dbRecord = await prisma.salesRecord.findUnique({
      where: { source_externalReference: { source: "MJ", externalReference: externalRef } }
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.transactionAt?.toISOString()).toBe(testTimeIso);

    // Format di Jakarta (WIB) harus jam 14:35:20, BUKAN 07:00:00
    const formatted = formatJakartaDateTime(dbRecord!.transactionAt!);
    expect(formatted).toContain("14.35.20 WIB");
    expect(formatJakartaDateTimeCompact(dbRecord!.transactionAt!)).toContain("14.35");

    // Cleanup
    const saleId = dbRecord!.id;
    await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.deliveryOrder.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.salesRecord.delete({ where: { id: saleId } });
  });

  it("2. Falls back safely to T00:00:00.000Z when transaction_at is omitted (Backward Compatibility)", async () => {
    const externalRef = `MJ-LEGACY-TEST-${Date.now()}`;
    const payload = {
      source: "MJ" as const,
      processing_mode: "record_only" as const,
      external_reference: externalRef,
      invoice_reference: `INV-${externalRef}`,
      invoice_date: "2026-09-06",
      currency: "IDR" as const,
      bookkeeping_type_code: "SLM",
      customer: {
        mode: "manual" as const,
        external_id: "MJ-CUST-LEGACY",
        name: "Toko Langganan Lama",
        address: "Pasar Baru"
      },
      payment: {
        method: "Cash" as const,
        status: "paid" as const,
        paid_amount: 100000,
        account: {
          mode: "manual" as const,
          account_reference: "CASH-MJ",
          name: "Kas MJ"
        }
      },
      items: [
        {
          product_reference: "AMJ01-2",
          product_name: "Barang Legacy",
          unit: "Pcs",
          quantity: 1,
          unit_price: 100000,
          discount: 0,
          subtotal: 100000
        }
      ],
      subtotal: 100000,
      discount: 0,
      total: 100000
    };

    const res = await createOrResumeMjInvoice(payload, principal);
    expect(res.status).toBe("created");

    const dbRecord = await prisma.salesRecord.findUnique({
      where: { source_externalReference: { source: "MJ", externalReference: externalRef } }
    });
    expect(dbRecord?.transactionAt?.toISOString()).toBe("2026-09-06T00:00:00.000Z");

    // Cleanup
    const saleId = dbRecord!.id;
    await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.deliveryOrder.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.salesRecord.delete({ where: { id: saleId } });
  });

  it("3. Syncs transaction_at on Tempo transaction and down payment", async () => {
    // 20:15:30 WIB = 13:15:30 UTC
    const testTimeIso = "2026-09-06T13:15:30.000Z";
    const externalRef = `MJ-TEMPO-TEST-${Date.now()}`;

    const payload = {
      source: "MJ" as const,
      processing_mode: "record_only" as const,
      external_reference: externalRef,
      invoice_reference: `INV-${externalRef}`,
      invoice_date: "2026-09-06",
      transaction_at: testTimeIso,
      currency: "IDR" as const,
      bookkeeping_type_code: "SLM",
      customer: {
        mode: "manual" as const,
        external_id: "MJ-CUST-TEMPO",
        name: "Toko Bangunan Sentosa",
        address: "Jl. Daan Mogot"
      },
      payment: {
        method: "Tempo" as const,
        status: "partial" as const,
        paid_amount: 50000,
        due_date: "2026-10-06",
        account: {
          mode: "manual",
          account_reference: "CASH-MJ",
          name: "Kas MJ"
        }
      },
      items: [
        {
          product_reference: "AMJ01-3",
          product_name: "Barang Tempo",
          unit: "Pcs",
          quantity: 2,
          unit_price: 100000,
          discount: 0,
          subtotal: 200000
        }
      ],
      subtotal: 200000,
      discount: 0,
      total: 200000
    };

    const res = await createOrResumeMjInvoice(payload, principal);
    expect(res.status).toBe("created");

    const dbRecord = await prisma.salesRecord.findUnique({
      where: { source_externalReference: { source: "MJ", externalReference: externalRef } }
    });
    const saleId = dbRecord!.id;
    const receivable = await prisma.tempoReceivable.findFirst({
      where: { salesId: saleId }
    });
    const payment = receivable
      ? await prisma.tempoPayment.findFirst({
          where: { tempoReceivableId: receivable.id }
        })
      : null;

    expect(dbRecord?.transactionAt?.toISOString()).toBe(testTimeIso);
    expect(payment?.paymentDate?.toISOString()).toBe(testTimeIso);

    // Cleanup
    if (payment) await prisma.tempoPayment.delete({ where: { id: payment.id } });
    if (receivable) await prisma.tempoReceivable.delete({ where: { id: receivable.id } });
    await prisma.salesRecordItem.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.deliveryOrder.deleteMany({ where: { salesRecordId: saleId } });
    await prisma.salesRecord.delete({ where: { id: saleId } });
  });
});
