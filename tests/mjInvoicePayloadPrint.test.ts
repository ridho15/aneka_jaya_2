import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "@prisma/client";
import { formatSaleDotMatrix } from "@/lib/print/dotMatrix";
import { createOrResumeMjInvoice } from "@/lib/integrations/mj/service";
import { loadEnvFiles } from "@/scripts/load-env.mjs";

loadEnvFiles();
const prisma = new PrismaClient();

describe("MJ Invoice Payload & Print E2E Test", () => {
  it("processes MJ invoice with SKU, unit, and product name properly", async () => {
    const externalRef = `MJ-TEST-${Date.now()}`;
    const testPayload = {
      source: "MJ" as const,
      processing_mode: "record_only" as const,
      external_reference: externalRef,
      invoice_reference: `INV-${externalRef}`,
      invoice_date: "2026-08-31",
      currency: "IDR" as const,
      bookkeeping_type_code: "SLM",
      customer: {
        mode: "manual" as const,
        external_id: "MJ-CUST-TEST",
        name: "Toko Sinar Rezeki (Test MJ)",
        address: "Pasar Pagi Mangga Dua"
      },
      payment: {
        method: "Cash" as const,
        status: "paid" as const,
        paid_amount: 300000,
        account: {
          mode: "slm" as const,
          rekening_id: "cash-w"
        }
      },
      items: [
        {
          product_reference: "RM-SEED-001",
          product_name: "Bahan Baku Plastik Granul",
          unit: "Pcs",
          warehouse_id: "1",
          warehouse_name: "Gudang Utama",
          quantity: 2,
          unit_price: 75000,
          discount: 0,
          subtotal: 150000
        },
        {
          product_reference: "BB001",
          product_name: "Bahan Baku A",
          unit: "Kg",
          warehouse_id: "1",
          warehouse_name: "Gudang Utama",
          quantity: 3,
          unit_price: 50000,
          discount: 0,
          subtotal: 150000
        }
      ],
      subtotal: 300000,
      discount: 0,
      total: 300000
    };

    const principal = {
      clientId: "6ee24610-03e9-4948-8cf8-97d2a5216c4f",
      clientCode: "mj-sandbox",
      environment: "sandbox" as const,
      name: "MJ Sandbox Client",
      role: "OWNER" as const,
      permissions: ["integrations.mj.manage", "penjualan.create", "reports.view"]
    };

    const result = await createOrResumeMjInvoice(testPayload as any, principal);
    expect(result.invoice.slm_id).toBeDefined();

    const sale = await prisma.salesRecord.findUnique({
      where: { id: result.invoice.slm_id },
      include: { items: true }
    });

    expect(sale).not.toBeNull();
    expect(sale!.items).toHaveLength(2);
    expect(sale!.items[0].productRef).toBe("RM-SEED-001");
    expect(sale!.items[0].unitSnapshot).toBe("Pcs");
    expect(sale!.items[0].warehouseNameSnapshot).toBe("Gudang Utama");
    expect(sale!.items[1].productRef).toBe("BB001");
    expect(sale!.items[1].unitSnapshot).toBe("Kg");

    const singleText = formatSaleDotMatrix(sale as any, { itemLayout: "single" });
    expect(singleText).toContain("RM-SEED-001");
    expect(singleText).toContain("2 Pcs");
    expect(singleText).toContain("BB001");
    expect(singleText).toContain("3 Kg");

    const doubleText = formatSaleDotMatrix(sale as any, { itemLayout: "double" });
    expect(doubleText).toContain("RM-SEED-001");
    expect(doubleText).toContain("2 Pcs");
    expect(doubleText).toContain("BB001");
    expect(doubleText).toContain("3 Kg");
  });

  it("stores and formats slm_process_aj items with SKU, unit, and product name properly", async () => {
    const externalRef = `MJ-AJ-${Date.now()}`;
    const testPayload = {
      source: "MJ" as const,
      processing_mode: "aj_already_processed" as const,
      external_reference: externalRef,
      invoice_reference: `INV-${externalRef}`,
      aj_invoice_number: `INV-${externalRef}`,
      aj_customer_id: "25",
      invoice_date: "2026-08-31",
      currency: "IDR" as const,
      bookkeeping_type_code: "SLM",
      customer: {
        mode: "existing" as const,
        customer_id: "25",
        name: "Toko Grosir Jaya"
      },
      payment: {
        method: "Cash" as const,
        status: "paid" as const,
        paid_amount: 150000,
        account: {
          mode: "slm" as const,
          rekening_id: "cash-w"
        }
      },
      items: [
        {
          external_product_id: "3",
          sku: "RM-SEED-001",
          product_name: "Bahan Baku Plastik Granul",
          unit: "Pcs",
          warehouse_id: "1",
          warehouse_name: "Gudang Utama",
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

    const principal = {
      clientId: "6ee24610-03e9-4948-8cf8-97d2a5216c4f",
      clientCode: "mj-sandbox",
      environment: "sandbox" as const,
      name: "MJ Sandbox Client",
      role: "OWNER" as const,
      permissions: ["integrations.mj.manage", "penjualan.create", "reports.view"]
    };

    const result = await createOrResumeMjInvoice(testPayload as any, principal);
    expect(result.invoice.slm_id).toBeDefined();

    const sale = await prisma.salesRecord.findUnique({
      where: { id: result.invoice.slm_id },
      include: { items: true }
    });

    expect(sale).not.toBeNull();
    expect(sale!.items[0].productRef).toBe("RM-SEED-001");
    expect(sale!.items[0].unitSnapshot).toBe("Pcs");
    expect(sale!.items[0].warehouseNameSnapshot).toBe("Gudang Utama");

    const singleText = formatSaleDotMatrix(sale as any, { itemLayout: "single" });
    expect(singleText).toContain("RM-SEED-001");
    expect(singleText).toContain("2 Pcs");

    await prisma.$disconnect();
  });
});
