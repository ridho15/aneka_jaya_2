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
      erpReference: "SLM-PAY-20260714-001",
      invoiceId: 25,
      customerId: 1,
      paymentDate: "2026-07-14",
      coaCode: "1112.01",
      paymentMethod: "TF",
      amount: 150000,
      notes: "Pembayaran invoice dari SLM"
    })).toMatchObject({
      success: true,
      data: {
        erp_reference: "SLM-PAY-20260714-001",
        customer_id: 1,
        payment_date: "2026-07-14",
        coa_code: "1112.01",
        payment_method: "Transfer",
        total_payment: 150000,
        selected_invoices: [25]
      }
    });
  });

  it("does not post payment again when invoice is already paid", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 0, settlement_status: "paid" } } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-1",
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      paymentAccountCode: "CASH",
      paymentMethod: "Cash",
      amount: 150000
    })).resolves.toMatchObject({ success: true, data: { status: "paid", paymentReference: "SLM-PAY-1", skipped: true } });

    expect(mocks.anikaRequest).toHaveBeenCalledTimes(1);
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/invoices/payment-status?invoice_number=INV-1");
  });

  it("posts payment after pre-check finds remaining receivable", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 150000, settlement_status: "unpaid" } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-2",
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      paymentAccountCode: "BCA_OPERASIONAL",
      paymentMethod: "TF",
      amount: 150000
    })).resolves.toMatchObject({ success: true, data: { status: "paid", paymentReference: "SLM-PAY-2" } });

    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"selected_invoices\":[25]")
    }));
    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"erp_reference\":\"SLM-PAY-2\"")
    }));
    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"payment_account_code\":\"BCA_OPERASIONAL\"")
    }));
  });

  it("parses paginated invoice status responses before posting payment", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({
        success: true,
        data: {
          data: {
            data: [{
              invoice_id: 44,
              invoice_number: "SLM-INV-1",
              party: { id: 32 },
              totals: { remaining: 30000, total: 30000 },
              payment_status: "unpaid"
            }]
          }
        }
      })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-PAGINATED",
      invoiceNumber: "SLM-INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      paymentAccountCode: "CASH",
      paymentMethod: "Cash",
      amount: 30000
    })).resolves.toMatchObject({ success: true, data: { status: "paid" } });

    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"selected_invoices\":[44]")
    }));
  });

  it("can post payment when invoice was recovered without an invoice number pre-check", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-RECOVERED",
      invoiceNumber: undefined,
      invoiceId: 44,
      customerId: 32,
      paymentDate: "2026-07-14",
      paymentAccountCode: "CASH",
      paymentMethod: "Cash",
      amount: 30000
    })).resolves.toMatchObject({ success: true, data: { status: "paid" } });

    expect(mocks.anikaRequest).toHaveBeenLastCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"customer_id\":32")
    }));
  });

  it("returns a safe failure when COA is missing", async () => {
    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-3",
      invoiceNumber: "INV-1",
      invoiceId: 25,
      customerId: 1,
      paymentDate: "2026-07-14",
      coaId: "",
      paymentMethod: "Cash",
      amount: 150000
    })).resolves.toMatchObject({ success: false, message: "COA code / payment account code ERP rekening penerima belum diatur." });
  });

  it("maps upstream COA validation errors to a rekening setup message", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 150000 } } })
      .mockResolvedValueOnce({ success: false, code: "ERP_VALIDATION", message: "ERP menolak payload: coa_code tidak valid", details: { upstreamCode: "coa_invalid" } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-4",
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      coaCode: "9999.99",
      paymentMethod: "Cash",
      amount: 150000
    })).resolves.toMatchObject({
      success: false,
      message: "COA code / payment account code rekening penerima tidak valid di Aneka Jaya. Periksa Pengaturan → Rekening."
    });
  });

  it("treats duplicate erp_reference as an idempotent paid payment", async () => {
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 1, remaining: 150000 } } })
      .mockResolvedValueOnce({ success: true, data: { status: "already_processed", data: { receipt_id: 12, erp_reference: "SLM-PAY-5", payment_status: "paid" } } });

    await expect(syncErpSalesPayment({
      erpReference: "SLM-PAY-5",
      invoiceNumber: "INV-1",
      invoiceId: 0,
      customerId: 0,
      paymentDate: "2026-07-14",
      coaCode: "1112.01",
      paymentMethod: "TF",
      amount: 150000
    })).resolves.toMatchObject({ success: true, data: { status: "paid", paymentReference: "SLM-PAY-5" } });
  });
});
