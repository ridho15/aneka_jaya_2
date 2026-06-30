import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MasterDataError extends Error {
    constructor(message: string, readonly code: "BOOKKEEPING_TYPE_NOT_FOUND" | "REKENING_NOT_FOUND") {
      super(message);
      this.name = "MasterDataError";
    }
  }

  return {
    role: "OWNER",
    createSale: vi.fn(),
    MasterDataError
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

vi.mock("@/lib/api/sales", () => ({
  createSale: mocks.createSale
}));

vi.mock("@/lib/business/masterData", () => ({
  MasterDataError: mocks.MasterDataError
}));

import { POST } from "@/app/api/sales/route";

const validPayload = {
  saleDate: "2026-06-29",
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "Aneka Jaya",
  rekeningId: "cash-aj",
  rekeningNameSnapshot: "Kas AJ",
  customerName: "Customer Route",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Cash",
  items: [{ productRef: "BRG-001", quantity: 1, unitPrice: 25000, discount: 0 }]
};

function request(payload: unknown) {
  return new Request("http://local/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

describe("sales API route contract", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.createSale.mockReset();
  });

  it("forwards AJ sales to the transaction service and returns ERP target metadata", async () => {
    mocks.createSale.mockResolvedValue({ success: true, data: { id: "S-AJ", target: "erp", syncStatus: "synced" } });

    const response = await POST(request(validPayload));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { target: "erp", syncStatus: "synced" } });
    expect(mocks.createSale).toHaveBeenCalledWith(expect.objectContaining({ tipeId: "AJ", tipeCodeSnapshot: "AJ" }));
  });

  it("forwards non-AJ sales to the transaction service and returns local target metadata", async () => {
    mocks.createSale.mockResolvedValue({ success: true, data: { id: "S-W", target: "local", syncStatus: "local" } });

    const response = await POST(request({ ...validPayload, tipeId: "W", tipeCodeSnapshot: "W", tipeNameSnapshot: "Walk In", rekeningId: "cash-w", rekeningNameSnapshot: "Kas Walk In" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { target: "local" } });
    expect(mocks.createSale).toHaveBeenCalledWith(expect.objectContaining({ tipeId: "W", tipeCodeSnapshot: "W" }));
  });

  it("returns retryable ERP failure data without exposing raw exceptions", async () => {
    mocks.createSale.mockResolvedValue({ success: true, data: { id: "S-AJ-FAILED", target: "erp", syncStatus: "failed", retryable: true } });

    const response = await POST(request(validPayload));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { syncStatus: "failed", retryable: true } });
  });

  it("rejects invalid rekening before the transaction is created", async () => {
    mocks.createSale.mockRejectedValue(new mocks.MasterDataError("Rekening penerima tidak tersedia untuk tipe pembukuan yang dipilih.", "REKENING_NOT_FOUND"));

    const response = await POST(request(validPayload));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, code: "REKENING_NOT_FOUND" });
  });

  it("rejects roles without penjualan.create", async () => {
    mocks.role = "VIEWER";

    const response = await POST(request(validPayload));

    expect(response.status).toBe(403);
    expect(mocks.createSale).not.toHaveBeenCalled();
  });
});
