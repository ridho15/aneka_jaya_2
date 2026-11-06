import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { appSetting: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));

import { getTaxStatus, isNonPkpOn, saveTaxStatus } from "@/lib/accounting/taxStatus";

const stored = (over: Record<string, unknown> = {}) => ({ value: JSON.stringify({ status: "NON_PKP", effectiveDate: "2026-01-01", verifiedBy: "Owner", verifiedAt: "2026-11-06T00:00:00.000Z", ...over }) });

describe("PKP status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({});
  });

  it("is Non-PKP from the effective date onward, and not before", async () => {
    mocks.findUnique.mockResolvedValue(stored());
    expect(await isNonPkpOn("2025-12-31")).toBe(false);
    expect(await isNonPkpOn("2026-01-01")).toBe(true);
    expect(await isNonPkpOn(new Date("2026-11-06T10:00:00Z"))).toBe(true);
  });

  it("assumes nothing when no status was saved", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await getTaxStatus()).toBeNull();
    expect(await isNonPkpOn("2026-11-06")).toBe(false);
  });

  it("never treats PKP as Non-PKP", async () => {
    mocks.findUnique.mockResolvedValue(stored({ status: "PKP" }));
    expect(await isNonPkpOn("2026-11-06")).toBe(false);
  });

  it("ignores a corrupt stored value instead of throwing", async () => {
    mocks.findUnique.mockResolvedValue({ value: "{not json" });
    expect(await getTaxStatus()).toBeNull();
    mocks.findUnique.mockResolvedValue({ value: JSON.stringify({ status: "NON_PKP" }) });
    expect(await getTaxStatus()).toBeNull();
  });

  it("survives a database failure", async () => {
    mocks.findUnique.mockRejectedValue(new Error("db down"));
    expect(await isNonPkpOn("2026-11-06")).toBe(false);
  });

  it("saves the status with who set it, and rejects a malformed date", async () => {
    const saved = await saveTaxStatus({ status: "NON_PKP", effectiveDate: "2026-01-01" }, { id: "owner", name: "Ridho Al Amzah" });
    expect(saved).toMatchObject({ status: "NON_PKP", effectiveDate: "2026-01-01", verifiedBy: "Ridho Al Amzah" });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "tax.pkp_status" } }));
    await expect(saveTaxStatus({ status: "NON_PKP", effectiveDate: "01/01/2026" }, { id: "owner", name: "x" })).rejects.toThrow("YYYY-MM-DD");
    await expect(saveTaxStatus({ status: "NON_PKP", effectiveDate: "2026-1-1" }, { id: "owner", name: "x" })).rejects.toThrow("YYYY-MM-DD");
  });
});
