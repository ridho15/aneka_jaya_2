import "server-only";
import { prisma } from "@/lib/db/prisma";

export type BookkeepingType = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export type RekeningAccount = {
  id: string;
  bank: string;
  name: string;
  accountNumber: string;
  isCash?: boolean;
  tipeIds: string[];
};

export async function listBookkeepingTypes(): Promise<BookkeepingType[]> {
  const rows = await prisma.bookkeepingType.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder
  }));
}

export async function saveBookkeepingTypes(rows: BookkeepingType[]): Promise<void> {
  await prisma.$transaction(rows.map((row) => prisma.bookkeepingType.upsert({
    where: { id: row.id },
    create: {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder
    },
    update: {
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder
    }
  })));
}

export async function listRekeningAccounts(): Promise<RekeningAccount[]> {
  const rows = await prisma.rekeningAccount.findMany({
    where: { isActive: true },
    include: { tipeLinks: { select: { bookkeepingTypeId: true } } },
    orderBy: { name: "asc" }
  });
  return rows.map((row) => ({
    id: row.id,
    bank: row.bankName || row.name,
    name: row.name,
    accountNumber: row.accountNumber || "-",
    isCash: row.bankName === "Cash",
    tipeIds: row.tipeLinks.map((link) => link.bookkeepingTypeId)
  }));
}

export async function saveRekeningAccounts(rows: RekeningAccount[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.rekeningAccount.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          name: row.name,
          accountNumber: row.accountNumber,
          bankName: row.bank,
          isActive: true
        },
        update: {
          name: row.name,
          accountNumber: row.accountNumber,
          bankName: row.bank,
          isActive: true
        }
      });
      await tx.rekeningAccountBookkeepingType.deleteMany({ where: { rekeningAccountId: row.id } });
      if (row.tipeIds.length) {
        await tx.rekeningAccountBookkeepingType.createMany({
          data: row.tipeIds.map((tipeId) => ({ rekeningAccountId: row.id, bookkeepingTypeId: tipeId })),
          skipDuplicates: true
        });
      }
    }
  });
}

export class MasterDataError extends Error {
  constructor(message: string, readonly code: "BOOKKEEPING_TYPE_NOT_FOUND" | "REKENING_NOT_FOUND") {
    super(message);
    this.name = "MasterDataError";
  }
}

export async function findTipe(tipeId?: string): Promise<BookkeepingType> {
  const types = await listBookkeepingTypes();
  const tipe = types.find((item) => item.id === tipeId) ?? (!tipeId ? types[0] : undefined);
  if (!tipe) throw new MasterDataError("Tipe pembukuan belum dikonfigurasi atau tidak ditemukan.", "BOOKKEEPING_TYPE_NOT_FOUND");
  return tipe;
}

export async function rekeningForTipe(tipeId?: string): Promise<RekeningAccount[]> {
  const tipe = await findTipe(tipeId);
  const all = await listRekeningAccounts();
  return all.filter((r) => r.tipeIds.includes(tipe.id));
}
