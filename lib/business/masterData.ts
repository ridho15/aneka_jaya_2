import "server-only";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
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

const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";

export async function listBookkeepingTypes(): Promise<BookkeepingType[]> {
  if (isProductionMode()) {
    const rows = await prisma.bookkeepingType.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder
    }));
  }
  const rows = await readJsonArray<BookkeepingType>("bookkeeping-types.json");
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveBookkeepingTypes(rows: BookkeepingType[]): Promise<void> {
  if (isProductionMode()) {
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
    return;
  }
  await writeJsonArray("bookkeeping-types.json", rows);
}

export async function listRekeningAccounts(): Promise<RekeningAccount[]> {
  if (isProductionMode()) {
    const rows = await prisma.rekeningAccount.findMany({
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
  const rows = await readJsonArray<RekeningAccount>("rekening-accounts.json");
  return rows;
}

export async function saveRekeningAccounts(rows: RekeningAccount[]): Promise<void> {
  if (isProductionMode()) {
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
    return;
  }
  await writeJsonArray("rekening-accounts.json", rows);
}

export async function findTipe(tipeId?: string): Promise<BookkeepingType> {
  const types = await listBookkeepingTypes();
  const tipe = types.find((item) => item.id === tipeId) ?? (!tipeId ? types[0] : undefined);
  if (!tipe) throw new Error("Tipe pembukuan belum dikonfigurasi atau tidak ditemukan.");
  return tipe;
}

export async function rekeningForTipe(tipeId?: string): Promise<RekeningAccount[]> {
  const tipe = await findTipe(tipeId);
  const all = await listRekeningAccounts();
  return all.filter((r) => r.tipeIds.includes(tipe.id));
}
