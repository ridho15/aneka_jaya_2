import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));

import { cancelErpSales } from "@/lib/api/salesCancellations";

const input = {
  erpReference: "SLM-CANCEL-S-1",
  sourceNumber: "SLM-INV-1",
  invoiceId: 44,
  saleReference: "S-1",
  stockReleaseReference: "SLM-STOCK-1",
  paymentReference: "SLM-PAY-1",
  cancelDate: "2026-07-14",
  reason: "Customer membatalkan transaksi",
  requestedBy: { id: "user-1", name: "Ridho Al Amzah", role: "OWNER" }
};

describe("ERP sales cancellations", () => {
  beforeEach(() => {
    mocks.anikaRequest.mockReset();
  });

  it("posts sales cancellation payload to the ERP endpoint", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: {
        status: "cancelled",
        data: {
          invoice_id: 44,
          invoice_number: "SLM-INV-1",
          invoice_status: "cancelled",
          stock_reversal_status: "reversed",
          payment_reversal_status: "reversed",
          journal_reversal_status: "posted",
          reversal_reference: "ERP-CANCEL-000001"
        }
      }
    });

    await expect(cancelErpSales(input)).resolves.toMatchObject({
      success: true,
      data: {
        status: "cancelled",
        invoiceId: 44,
        invoiceNumber: "SLM-INV-1",
        reversalReference: "ERP-CANCEL-000001"
      }
    });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales-cancellations", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"erp_reference\":\"SLM-CANCEL-S-1\"")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales-cancellations", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"source_type\":\"invoice\"")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales-cancellations", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"stock_release_reference\":\"SLM-STOCK-1\"")
    }));
  });

  it("treats duplicate cancellation references as idempotent success", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: {
        status: "already_cancelled",
        data: {
          invoice_status: "cancelled",
          reversal_reference: "ERP-CANCEL-000001"
        }
      }
    });

    await expect(cancelErpSales(input)).resolves.toMatchObject({
      success: true,
      data: {
        status: "already_cancelled",
        invoiceStatus: "cancelled",
        reversalReference: "ERP-CANCEL-000001"
      }
    });
  });

  it("requires invoice number or invoice id before calling ERP", async () => {
    await expect(cancelErpSales({ ...input, sourceNumber: undefined, invoiceId: undefined })).resolves.toMatchObject({
      success: false,
      message: "Nomor invoice ERP belum tersedia untuk cancel."
    });

    expect(mocks.anikaRequest).not.toHaveBeenCalled();
  });
});
