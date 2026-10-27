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

import { findTipe, listBookkeepingTypes, listRekeningAccounts, resolveSalesRekening, saveRekeningAccounts } from "@/lib/business/masterData";

describe("master data normalized persistence", () => {
  beforeEach(() => {
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

  it("uses Prisma in local development and returns a stable missing-type error", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");
    mocks.prisma.bookkeepingType.findMany.mockResolvedValue([]);

    await expect(findTipe("W")).rejects.toMatchObject({
      code: "BOOKKEEPING_TYPE_NOT_FOUND",
      message: "Tipe pembukuan belum dikonfigurasi atau tidak ditemukan."
    });
  });

  it("derives RekeningAccount.tipeIds from the junction table for UI compatibility", async () => {
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([
      {
        id: "cash-w",
        bankName: "Cash",
        name: "Cash W",
        accountNumber: "-",
        isActive: true,
        tipeLinks: [{ bookkeepingTypeId: "W" }]
      }
    ]);

    const accounts = await listRekeningAccounts();
    expect(accounts).toEqual([
      expect.objectContaining({
        id: "cash-w",
        bank: "Cash",
        name: "Cash W",
        accountNumber: "-",
        isCash: true,
        tipeIds: ["W"],
        currency: "IDR"
      })
    ]);
    expect(mocks.prisma.rekeningAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it("writes rekening-to-tipe assignments through the junction table", async () => {
    await saveRekeningAccounts([
      { id: "cash-w", bank: "Cash", name: "Cash W", accountNumber: "-", isCash: true, tipeIds: ["W", "AJ"] }
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
        { rekeningAccountId: "cash-w", bookkeepingTypeId: "AJ" }
      ],
      skipDuplicates: true
    });
  });

  it("resolves Cash sales to the active Kas Walk In account", async () => {
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([
      { id: "dummy-bca-w", bankName: "BCA", name: "BCA Operasional", accountNumber: "123", isActive: true, tipeLinks: [{ bookkeepingTypeId: "W" }] },
      { id: "cash-w", bankName: "Cash", name: "Kas Walk In", accountNumber: "-", isActive: true, tipeLinks: [{ bookkeepingTypeId: "W" }] }
    ]);

    await expect(resolveSalesRekening("Cash", "AJ")).resolves.toMatchObject({ id: "cash-w", name: "Kas Walk In" });
  });

  it("rejects Cash sales when Kas Walk In is not active or missing", async () => {
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([
      { id: "dummy-bca-w", bankName: "BCA", name: "BCA Operasional", accountNumber: "123", isActive: true, tipeLinks: [{ bookkeepingTypeId: "W" }] }
    ]);

    await expect(resolveSalesRekening("Cash", "W")).rejects.toMatchObject({
      code: "REKENING_NOT_FOUND",
      message: "Kas Walk In belum tersedia atau belum aktif. Jalankan seed master data sebelum input penjualan Cash."
    });
  });

  it("keeps TF validation tied to the selected tipe rekening", async () => {
    mocks.prisma.bookkeepingType.findMany.mockResolvedValue([
      { id: "W", code: "W", name: "Walk In", isActive: true, sortOrder: 1 }
    ]);
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([
      { id: "dummy-bca-w", bankName: "BCA", name: "BCA Operasional", accountNumber: "123", isActive: true, tipeLinks: [{ bookkeepingTypeId: "W" }] }
    ]);

    await expect(resolveSalesRekening("TF", "W", "dummy-bca-w")).resolves.toMatchObject({ id: "dummy-bca-w" });
    await expect(resolveSalesRekening("TF", "W")).rejects.toMatchObject({ code: "REKENING_NOT_FOUND" });
  });
});
