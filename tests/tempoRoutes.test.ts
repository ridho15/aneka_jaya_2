import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  payTempo: vi.fn(),
  cancelTempo: vi.fn(),
  writeOffTempo: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentRole: vi.fn(async () => mocks.role) }));
vi.mock("@/lib/tempo/store", () => ({
  payTempo: mocks.payTempo,
  cancelTempo: mocks.cancelTempo,
  writeOffTempo: mocks.writeOffTempo
}));

import { POST as payTempoRoute } from "@/app/api/tempo/[id]/pay/route";
import { POST as cancelTempoRoute } from "@/app/api/tempo/[id]/cancel/route";
import { POST as writeOffTempoRoute } from "@/app/api/tempo/[id]/write-off/route";

describe("Tempo API routes", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.payTempo.mockReset();
    mocks.cancelTempo.mockReset();
    mocks.writeOffTempo.mockReset();
  });

  it("rejects invalid payment payloads before calling store", async () => {
    const response = await payTempoRoute(new Request("http://local/api/tempo/TMP-1/pay", {
      method: "POST",
      body: JSON.stringify({ paymentDate: "invalid", amountPaid: "NaN", rekeningId: "" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.payTempo).not.toHaveBeenCalled();
  });

  it("passes validated payment payload without trusting rekeningNameSnapshot", async () => {
    mocks.payTempo.mockResolvedValue({ receivable: { id: "TMP-1" }, payment: { id: "TPY-1" } });
    const response = await payTempoRoute(new Request("http://local/api/tempo/TMP-1/pay", {
      method: "POST",
      body: JSON.stringify({ paymentDate: "2026-06-29", amountPaid: 100, paymentMethod: "TF", rekeningId: "cash-w", rekeningNameSnapshot: "Tampered" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.payTempo).toHaveBeenCalledWith("TMP-1", expect.objectContaining({ rekeningId: "cash-w", rekeningNameSnapshot: "" }));
  });

  it("allows OWNER to cancel Tempo with reason", async () => {
    mocks.cancelTempo.mockResolvedValue({ id: "TMP-1", status: "cancelled" });
    const response = await cancelTempoRoute(new Request("http://local/api/tempo/TMP-1/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "Customer membatalkan order" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.cancelTempo).toHaveBeenCalledWith("TMP-1", "Customer membatalkan order");
  });

  it("allows OWNER to write-off Tempo with reason", async () => {
    mocks.writeOffTempo.mockResolvedValue({ id: "TMP-1", status: "written_off" });
    const response = await writeOffTempoRoute(new Request("http://local/api/tempo/TMP-1/write-off", {
      method: "POST",
      body: JSON.stringify({ reason: "Sisa tidak tertagih" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.writeOffTempo).toHaveBeenCalledWith("TMP-1", "Sisa tidak tertagih");
  });

  it("rejects cancel/write-off for roles without permission", async () => {
    mocks.role = "FINANCE";
    const cancelResponse = await cancelTempoRoute(new Request("http://local/api/tempo/TMP-1/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "Tidak jadi" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });
    const writeOffResponse = await writeOffTempoRoute(new Request("http://local/api/tempo/TMP-1/write-off", {
      method: "POST",
      body: JSON.stringify({ reason: "Tidak tertagih" })
    }), { params: Promise.resolve({ id: "TMP-1" }) });

    expect(cancelResponse.status).toBe(403);
    expect(writeOffResponse.status).toBe(403);
    expect(mocks.cancelTempo).not.toHaveBeenCalled();
    expect(mocks.writeOffTempo).not.toHaveBeenCalled();
  });
});
