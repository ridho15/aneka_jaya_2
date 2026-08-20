import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findInvoice: vi.fn(),
  recordPrintEvent: vi.fn(),
}));
vi.mock("@/lib/integrations/mj/auth", () => ({
  authenticateMjRequest: mocks.authenticate,
}));
vi.mock("@/lib/integrations/mj/service", () => ({
  findMjInvoice: mocks.findInvoice,
  recordMjPrintEvent: mocks.recordPrintEvent,
}));

import { POST } from "@/app/api/integrations/mj/invoices/[external_reference]/print-events/route";

describe("MJ print-events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      clientId: "client-1",
      clientCode: "mj",
      environment: "sandbox",
      tokenId: "token-1",
    });
    mocks.findInvoice.mockResolvedValue({ id: "sale-1", externalReference: "INV-1" });
    mocks.recordPrintEvent.mockResolvedValue({
      status: "recorded",
      is_printed: true,
      print_count: 1,
      printed_at: "2026-08-20T15:30:00.000Z",
      printed_by: "Kasir MJ",
    });
  });

  it("authenticates and records print event successfully", async () => {
    const payload = {
      printed_at: "2026-08-20T15:30:00.000Z",
      printed_by: "Kasir MJ",
      printer_name: "Epson LX-310",
      format: "dot_matrix",
    };

    const response = await POST(
      new Request("http://local/api/integrations/mj/invoices/INV-1/print-events", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ external_reference: "INV-1" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: {
        status: "recorded",
        is_printed: true,
      },
    });
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.any(Request), "mutation");
    expect(mocks.findInvoice).toHaveBeenCalledWith("INV-1");
    expect(mocks.recordPrintEvent).toHaveBeenCalledWith(
      { id: "sale-1", externalReference: "INV-1" },
      expect.objectContaining({ printed_by: "Kasir MJ" }),
      expect.objectContaining({ clientId: "client-1" })
    );
  });

  it("handles empty body gracefully with default print event values", async () => {
    const response = await POST(
      new Request("http://local/api/integrations/mj/invoices/INV-1/print-events", {
        method: "POST",
      }),
      { params: Promise.resolve({ external_reference: "INV-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.findInvoice).toHaveBeenCalledWith("INV-1");
  });
});
