import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));

import { buildSalesPaymentPayload, syncErpSalesPayment } from "@/lib/api/salesPayments";

describe("ERP sales payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds sales payment payload with ERP invoice and COA", () => {
    expect(buildSalesPaymentPayload({
      invoiceId: 25,
      customerId: 1,
      paymentDate: "2026-07-14",
      coaId: "10",
      paymentMethod: "TF",
      amount: 150000,
      notes: "Pembayaran invoice dari SLM"
    })).toMatchObject({
      success: true,
      data: {
        customer_id: 1,
        payment_date: "2026-07-14",
        coa_id: 10,
        payment_method: "Transfer",
        total_payment: 150000,
        selected_invoices: [25]
      }
    });
  });

  it("does not post payment again when invoice is already paid", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 0, settlement_status: "paid" } } });

    await expect(syncErpSalesPayment({
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      coaId: "10",
      paymentMethod: "Cash",
      amount: 150000
    })).resolves.toMatchObject({ success: true, data: { status: "paid", skipped: true } });

    expect(mocks.anikaRequest).toHaveBeenCalledTimes(1);
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/invoices/payment-status?invoice_number=INV-1");
  });

  it("posts payment after pre-check finds remaining receivable", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 150000, settlement_status: "unpaid" } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });

    await expect(syncErpSalesPayment({
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      coaId: "10",
      paymentMethod: "TF",
      amount: 150000
    })).resolves.toMatchObject({ success: true, data: { status: "paid", paymentReference: "12" } });

    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"selected_invoices\":[25]")
    }));
  });

  it("returns a safe failure when COA is missing", async () => {
    await expect(syncErpSalesPayment({
      invoiceNumber: "INV-1",
      invoiceId: 25,
      customerId: 1,
      paymentDate: "2026-07-14",
      coaId: "",
      paymentMethod: "Cash",
      amount: 150000
    })).resolves.toMatchObject({ success: false, message: "COA ERP rekening penerima belum valid." });
  });
});
