import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn(),
  listErpPaginated: vi.fn(),
  listProducts: vi.fn(),
  findProductIdBySku: vi.fn(),
  createOfficialProduct: vi.fn(),
  recordAudit: vi.fn()
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: mocks.listErpPaginated }));
vi.mock("@/lib/api/products", () => ({ listProducts: mocks.listProducts, findProductIdBySku: mocks.findProductIdBySku, createOfficialProduct: mocks.createOfficialProduct }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));

import { erpInvoiceIdentityFrom, sendOfficialSalesToErp, updateOfficialSalesInErp } from "@/lib/api/sales";

const input = {
  saleDate: "2026-07-16",
  customerName: "Budi",
  customerLocation: "Toko",
  paymentMethod: "Cash" as const,
  shippingMethod: "Kirim Langsung",
  items: [{ productRef: "P-1", productId: "123", productInputMode: "erp" as const, quantity: 2, unitPrice: 125000, discount: 0 }]
};

describe("ERP sales adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [{ id: 77, name: "Budi", code: "CUST-001" }] });
    mocks.listProducts.mockResolvedValue({ success: true, data: [] });
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { status: "created" }, details: { status: 201, body: { status: "created" } } });
  });

  it("creates sales with POST /sales and a stable SLM erp_reference", async () => {
    await expect(sendOfficialSalesToErp(input)).resolves.toMatchObject({ success: true });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({ method: "POST" }));
    const payload = JSON.parse(mocks.anikaRequest.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      source: "SLM",
      customer_id: 77,
      order_date: "2026-07-16",
      items: [{ product_id: 123, quantity: 2, unit_price: 125000, tax: 0, tipe_pajak: "Non Pajak" }]
    });
    expect(payload.erp_reference).toMatch(/^SLM-SALE-/);
  });

  it("extracts invoice identity separately from the idempotency reference", () => {
    expect(erpInvoiceIdentityFrom({ erp_reference: "SLM-SALE-1", invoice_id: 44, invoice_number: "INV-44" })).toEqual({ invoiceId: 44, invoiceNumber: "INV-44" });
    expect(erpInvoiceIdentityFrom({ data: { invoice: { id: "45", invoice_number: "INV-45" } } })).toEqual({ invoiceId: 45, invoiceNumber: "INV-45" });
    expect(erpInvoiceIdentityFrom({ data: { invoices: [{ id: 46, invoice_number: "INV-46" }] } })).toEqual({ invoiceId: 46, invoiceNumber: "INV-46" });
    expect(erpInvoiceIdentityFrom({ slm_invoice_number: "INV-FALLBACK" })).toEqual({ invoiceId: undefined, invoiceNumber: "INV-FALLBACK" });
  });

  it("updates sales with PUT /sales/{erpReference} and matching payload reference", async () => {
    await expect(updateOfficialSalesInErp(input, "SLM-SALE-20260716-001")).resolves.toMatchObject({ success: true });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales/SLM-SALE-20260716-001", expect.objectContaining({ method: "PUT" }));
    const payload = JSON.parse(mocks.anikaRequest.mock.calls[0][1].body);
    expect(payload.erp_reference).toBe("SLM-SALE-20260716-001");
    expect(payload.items).toHaveLength(1);
  });

  it("maps HTTP 422 update rejection to the correction workflow message", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({
      success: false,
      code: "ERP_VALIDATION",
      message: "ERP menolak payload: pembayaran sudah diterima",
      details: { status: 422, upstreamCode: "validation_failed" }
    });

    await expect(updateOfficialSalesInErp(input, "SLM-SALE-20260716-001")).resolves.toMatchObject({
      success: false,
      code: "ERP_SALES_UPDATE_REJECTED",
      message: "ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru."
    });
  });
});
