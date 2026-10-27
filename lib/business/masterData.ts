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
  erpCoaId?: string;
  erpCoaNameSnapshot?: string;
  isCash?: boolean;
  isActive?: boolean;
  tipeIds: string[];
  currency?: string;
  openingBalanceValas?: number;
  openingBalanceDate?: string;
  openingRate?: number;
};

export const CASH_WALK_IN_REKENING_ID = "cash-w";
export const CASH_WALK_IN_REKENING_NAME = "Kas Walk In";

function isMissingColumnError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2022");
}

type RekeningLegacyRow = {
  id: string;
  name: string;
  accountNumber: string | null;
  bankName: string | null;
  isActive: boolean;
};

type RekeningLinkLegacyRow = {
  rekeningAccountId: string;
  bookkeepingTypeId: string;
};

async function listRekeningAccountsLegacy(activeOnly: boolean): Promise<RekeningAccount[]> {
  const rows = activeOnly
    ? await prisma.$queryRaw<RekeningLegacyRow[]>`SELECT "id", "name", "accountNumber", "bankName", "isActive" FROM "RekeningAccount" WHERE "isActive" = true ORDER BY "name" ASC`
    : await prisma.$queryRaw<RekeningLegacyRow[]>`SELECT "id", "name", "accountNumber", "bankName", "isActive" FROM "RekeningAccount" ORDER BY "isActive" DESC, "name" ASC`;
  const links = await prisma.$queryRaw<RekeningLinkLegacyRow[]>`SELECT "rekeningAccountId", "bookkeepingTypeId" FROM "RekeningAccountBookkeepingType"`;
  const tipeByRekening = new Map<string, string[]>();
  for (const link of links) tipeByRekening.set(link.rekeningAccountId, [...(tipeByRekening.get(link.rekeningAccountId) || []), link.bookkeepingTypeId]);
  return rows.map((row) => ({
    id: row.id,
    bank: row.bankName || row.name,
    name: row.name,
    accountNumber: row.accountNumber || "-",
    isCash: row.bankName === "Cash",
    isActive: row.isActive,
    tipeIds: tipeByRekening.get(row.id) || []
  }));
}

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
  }).catch((error) => {
    if (isMissingColumnError(error)) return undefined;
    throw error;
  });
  if (!rows) return listRekeningAccountsLegacy(true);
  return rows.map((row) => ({
    id: row.id,
    bank: row.bankName || row.name,
    name: row.name,
    accountNumber: row.accountNumber || "-",
    erpCoaId: row.erpCoaId || undefined,
    erpCoaNameSnapshot: row.erpCoaNameSnapshot || undefined,
    isCash: row.bankName === "Cash",
    tipeIds: row.tipeLinks.map((link) => link.bookkeepingTypeId),
    currency: row.currency || "IDR",
    openingBalanceValas: Number(row.openingBalanceValas || 0),
    openingBalanceDate: row.openingBalanceDate ? row.openingBalanceDate.toISOString() : undefined,
    openingRate: Number(row.openingRate || 1)
  }));
}

export async function listAllRekeningAccounts(): Promise<RekeningAccount[]> {
  const rows = await prisma.rekeningAccount.findMany({
    include: { tipeLinks: { select: { bookkeepingTypeId: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  }).catch((error) => {
    if (isMissingColumnError(error)) return undefined;
    throw error;
  });
  if (!rows) return listRekeningAccountsLegacy(false);
  return rows.map((row) => ({
    id: row.id,
    bank: row.bankName || row.name,
    name: row.name,
    accountNumber: row.accountNumber || "-",
    erpCoaId: row.erpCoaId || undefined,
    erpCoaNameSnapshot: row.erpCoaNameSnapshot || undefined,
    isCash: row.bankName === "Cash",
    isActive: row.isActive,
    tipeIds: row.tipeLinks.map((link) => link.bookkeepingTypeId),
    currency: row.currency || "IDR",
    openingBalanceValas: Number(row.openingBalanceValas || 0),
    openingBalanceDate: row.openingBalanceDate ? row.openingBalanceDate.toISOString() : undefined,
    openingRate: Number(row.openingRate || 1)
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
          erpCoaId: row.erpCoaId,
          erpCoaNameSnapshot: row.erpCoaNameSnapshot,
          isActive: row.isActive ?? true,
          currency: row.currency || "IDR",
          openingBalanceValas: row.openingBalanceValas ?? 0,
          openingBalanceDate: row.openingBalanceDate ? new Date(row.openingBalanceDate) : null,
          openingRate: row.openingRate ?? 1
        },
        update: {
          name: row.name,
          accountNumber: row.accountNumber,
          bankName: row.bank,
          erpCoaId: row.erpCoaId,
          erpCoaNameSnapshot: row.erpCoaNameSnapshot,
          isActive: row.isActive ?? true,
          currency: row.currency || "IDR",
          openingBalanceValas: row.openingBalanceValas ?? 0,
          openingBalanceDate: row.openingBalanceDate ? new Date(row.openingBalanceDate) : null,
          openingRate: row.openingRate ?? 1
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

export async function resolveSalesRekening(paymentMethod: string, tipeId: string, rekeningId?: string): Promise<RekeningAccount | undefined> {
  if (paymentMethod === "Cash") {
    const cashWalkIn = (await listRekeningAccounts()).find((rekening) => rekening.id === CASH_WALK_IN_REKENING_ID);
    if (!cashWalkIn) throw new MasterDataError(`${CASH_WALK_IN_REKENING_NAME} belum tersedia atau belum aktif. Jalankan seed master data sebelum input penjualan Cash.`, "REKENING_NOT_FOUND");
    return cashWalkIn;
  }

  const rekenings = await rekeningForTipe(tipeId);
  if (paymentMethod === "TF") {
    const rekening = rekeningId ? rekenings.find((item) => item.id === rekeningId) : undefined;
    if (!rekening) throw new MasterDataError("Rekening penerima tidak tersedia untuk tipe pembukuan yang dipilih.", "REKENING_NOT_FOUND");
    return rekening;
  }

  if (rekeningId) {
    const rekening = rekenings.find((item) => item.id === rekeningId);
    if (!rekening) throw new MasterDataError("Rekening penerima tidak tersedia untuk tipe pembukuan yang dipilih.", "REKENING_NOT_FOUND");
    return rekening;
  }

  return undefined;
}
