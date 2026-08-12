import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), findInvoice: vi.fn(), cancelInvoice: vi.fn() }));
vi.mock("@/lib/integrations/mj/auth", () => ({ authenticateMjRequest: mocks.authenticate }));
vi.mock("@/lib/integrations/mj/service", () => ({ findMjInvoice: mocks.findInvoice, cancelMjInvoice: mocks.cancelInvoice }));

import { POST } from "@/app/api/integrations/mj/invoices/[external_reference]/cancel/route";

describe("MJ cancel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ clientId: "client-1", clientCode: "mj", environment: "sandbox", tokenId: "token-1" });
    mocks.findInvoice.mockResolvedValue({ id: "sale-1" });
    mocks.cancelInvoice.mockResolvedValue({ status: "cancelled" });
  });

  it("validates reason and passes integration principal to cancellation", async () => {
    const response = await POST(new Request("http://local/api/integrations/mj/invoices/INV-1/cancel", { method: "POST", body: JSON.stringify({ reason: "Dibatalkan MJ" }) }), { params: Promise.resolve({ external_reference: "INV-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.cancelInvoice).toHaveBeenCalledWith({ id: "sale-1" }, "Dibatalkan MJ", expect.objectContaining({ clientId: "client-1" }));
  });

  it("rejects an invalid reason before loading the invoice", async () => {
    const response = await POST(new Request("http://local/api/integrations/mj/invoices/INV-1/cancel", { method: "POST", body: JSON.stringify({ reason: "x" }) }), { params: Promise.resolve({ external_reference: "INV-1" }) });
    expect(response.status).toBe(400);
    expect(mocks.findInvoice).not.toHaveBeenCalled();
  });
});
