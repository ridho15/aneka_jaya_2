import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    bookkeepingType: { findMany: vi.fn(), upsert: vi.fn() },
    rekeningAccount: { findMany: vi.fn(), upsert: vi.fn() },
    rekeningAccountBookkeepingType: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(mocks.prisma);
      return Promise.all(input as Promise<unknown>[]);
    })
  }
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { listBookkeepingTypes, listRekeningAccounts, saveRekeningAccounts } from "@/lib/business/masterData";

describe("master data normalized persistence", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    mocks.prisma.bookkeepingType.findMany.mockReset();
    mocks.prisma.bookkeepingType.upsert.mockReset();
    mocks.prisma.rekeningAccount.findMany.mockReset();
    mocks.prisma.rekeningAccount.upsert.mockReset();
    mocks.prisma.rekeningAccountBookkeepingType.deleteMany.mockReset();
    mocks.prisma.rekeningAccountBookkeepingType.createMany.mockReset();
    mocks.prisma.$transaction.mockClear();
  });

  it("reads bookkeeping types from Prisma with sort order", async () => {
    mocks.prisma.bookkeepingType.findMany.mockResolvedValue([
      { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 }
    ]);

    await expect(listBookkeepingTypes()).resolves.toEqual([
      { id: "W", code: "W", name: "W", isActive: true, sortOrder: 1 }
    ]);
  });

  it("derives RekeningAccount.tipeIds from the junction table for UI compatibility", async () => {
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([
      {
        id: "cash-w",
        bankName: "Cash",
        name: "Cash W",
        accountNumber: "-",
        tipeLinks: [{ bookkeepingTypeId: "W" }]
      }
    ]);

    await expect(listRekeningAccounts()).resolves.toEqual([
      { id: "cash-w", bank: "Cash", name: "Cash W", accountNumber: "-", isCash: true, tipeIds: ["W"] }
    ]);
  });

  it("writes rekening-to-tipe assignments through the junction table", async () => {
    await saveRekeningAccounts([
      { id: "cash-w", bank: "Cash", name: "Cash W", accountNumber: "-", isCash: true, tipeIds: ["W", "SLM"] }
    ]);

    expect(mocks.prisma.rekeningAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cash-w" },
      create: expect.objectContaining({ bankName: "Cash" }),
      update: expect.objectContaining({ bankName: "Cash" })
    }));
    expect(mocks.prisma.rekeningAccountBookkeepingType.deleteMany).toHaveBeenCalledWith({ where: { rekeningAccountId: "cash-w" } });
    expect(mocks.prisma.rekeningAccountBookkeepingType.createMany).toHaveBeenCalledWith({
      data: [
        { rekeningAccountId: "cash-w", bookkeepingTypeId: "W" },
        { rekeningAccountId: "cash-w", bookkeepingTypeId: "SLM" }
      ],
      skipDuplicates: true
    });
  });
});
