import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import { postJournalEntry } from "./journalStore";
import { accountForRole, lineFor } from "./accountRoles";

/** Kebijakan aset tetap. Angka bawaan dari keputusan pemilik; tetap perlu dikonfirmasi di halaman Aset Tetap. */
export type FixedAssetPolicy = {
  capitalizationThreshold: number;
  defaultUsefulLifeMonths: number;
  method: "STRAIGHT_LINE";
  /** Penyusutan mulai bulan aset siap dipakai (penuh satu bulan). */
  startRule: "MONTH_AVAILABLE";
  confirmedAt: string | null;
  confirmedBy: string | null;
};

const POLICY_KEY = "accounting.fixed_asset_policy";
export const DEFAULT_POLICY: FixedAssetPolicy = {
  capitalizationThreshold: 1_000_000,
  defaultUsefulLifeMonths: 12,
  method: "STRAIGHT_LINE",
  startRule: "MONTH_AVAILABLE",
  confirmedAt: null,
  confirmedBy: null
};

export async function getFixedAssetPolicy(): Promise<FixedAssetPolicy> {
  const row = await prisma.appSetting.findUnique({ where: { key: POLICY_KEY } }).catch(() => null);
  if (!row) return DEFAULT_POLICY;
  try {
    return { ...DEFAULT_POLICY, ...(JSON.parse(row.value) as Partial<FixedAssetPolicy>) };
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function confirmFixedAssetPolicy(input: { capitalizationThreshold: number; defaultUsefulLifeMonths: number }, actor: { id: string; name: string }) {
  if (!(input.capitalizationThreshold > 0) || !(input.defaultUsefulLifeMonths >= 1)) throw new Error("Batas kapitalisasi dan umur manfaat harus lebih dari 0.");
  const policy: FixedAssetPolicy = { ...DEFAULT_POLICY, ...input, confirmedAt: new Date().toISOString(), confirmedBy: actor.name };
  await prisma.appSetting.upsert({
    where: { key: POLICY_KEY },
    create: { key: POLICY_KEY, value: JSON.stringify(policy), description: "Kebijakan kapitalisasi & penyusutan aset tetap", updatedByUserId: actor.id, updatedByNameSnapshot: actor.name },
    update: { value: JSON.stringify(policy), updatedByUserId: actor.id, updatedByNameSnapshot: actor.name }
  });
  return policy;
}

type AssetRow = Awaited<ReturnType<typeof prisma.fixedAsset.findMany>>[number];

/** Data wajib sebelum aset boleh disusutkan. Nilai residu 0 harus diisi eksplisit. */
export function missingAssetFields(a: Pick<AssetRow, "acquisitionDate" | "acquisitionCost" | "locationName" | "availableForUseDate" | "usefulLifeMonths" | "residualValue">) {
  const missing: string[] = [];
  if (!a.acquisitionDate) missing.push("tanggal perolehan");
  if (!(Number(a.acquisitionCost) > 0)) missing.push("biaya perolehan");
  if (!a.locationName?.trim()) missing.push("lokasi");
  if (!a.availableForUseDate) missing.push("tanggal siap dipakai");
  if (!a.usefulLifeMonths || a.usefulLifeMonths < 1) missing.push("umur manfaat");
  if (a.residualValue == null) missing.push("nilai residu");
  return missing;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthIndex = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};

/** Penyusutan garis lurus per bulan; bulan terakhir menyerap sisa pembulatan. */
export function depreciationForMonth(a: Pick<AssetRow, "acquisitionCost" | "residualValue" | "usefulLifeMonths" | "availableForUseDate">, period: string) {
  if (!a.availableForUseDate || !a.usefulLifeMonths) return 0;
  const base = Number(a.acquisitionCost) - Number(a.residualValue ?? 0);
  if (base <= 0) return 0;
  const n = monthIndex(period) - monthIndex(monthKey(a.availableForUseDate));
  if (n < 0 || n >= a.usefulLifeMonths) return 0;
  const monthly = Math.floor((base / a.usefulLifeMonths) * 100) / 100;
  return n === a.usefulLifeMonths - 1 ? Math.round((base - monthly * (a.usefulLifeMonths - 1)) * 100) / 100 : monthly;
}

export async function nextAssetNumber() {
  const year = new Date().getFullYear();
  const last = await prisma.fixedAsset.findFirst({ where: { assetNumber: { startsWith: `AT-${year}-` } }, orderBy: { assetNumber: "desc" }, select: { assetNumber: true } });
  const seq = last ? Number(last.assetNumber.split("-").pop()) + 1 : 1;
  return `AT-${year}-${String(seq).padStart(4, "0")}`;
}

/** Pengeluaran peralatan yang dikapitalisasi otomatis menjadi aset tetap (status DRAFT sampai datanya lengkap). */
export async function createAssetFromExpense(expense: { id: string; description: string | null; amount: unknown; expenseDate: Date; createdByUserId?: string | null; createdByNameSnapshot?: string | null }) {
  const existing = await prisma.fixedAsset.findUnique({ where: { sourceType_sourceId: { sourceType: "EXPENSE", sourceId: expense.id } } });
  if (existing) return existing;
  return prisma.fixedAsset.create({
    data: {
      assetNumber: await nextAssetNumber(),
      name: (expense.description || "Peralatan").slice(0, 160),
      acquisitionDate: expense.expenseDate,
      acquisitionCost: Number(expense.amount),
      status: "DRAFT",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      createdByUserId: expense.createdByUserId ?? undefined,
      createdByName: expense.createdByNameSnapshot ?? undefined
    }
  });
}

export type AssetUpdate = {
  name?: string;
  acquisitionDate?: string | null;
  acquisitionCost?: number;
  locationName?: string | null;
  availableForUseDate?: string | null;
  usefulLifeMonths?: number | null;
  residualValue?: number | null;
  notes?: string | null;
};

/** Ubah data aset. Biaya perolehan aset yang sudah dijurnal dari pengeluaran tidak bisa diubah di sini. */
export async function updateFixedAsset(id: string, input: AssetUpdate) {
  const before = await prisma.fixedAsset.findUnique({ where: { id } });
  if (!before) throw new Error("Aset tidak ditemukan.");
  if (input.acquisitionCost !== undefined && before.sourceType === "EXPENSE" && Number(before.acquisitionCost) !== input.acquisitionCost) {
    throw new Error("Biaya perolehan berasal dari pengeluaran yang sudah dijurnal. Koreksi lewat pengeluarannya.");
  }
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null);
  const data = {
    name: input.name?.trim() || undefined,
    acquisitionDate: date(input.acquisitionDate),
    acquisitionCost: input.acquisitionCost,
    locationName: input.locationName === undefined ? undefined : input.locationName?.trim() || null,
    availableForUseDate: date(input.availableForUseDate),
    usefulLifeMonths: input.usefulLifeMonths,
    residualValue: input.residualValue,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null
  };
  const merged = { ...before, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) } as AssetRow;
  if (merged.residualValue != null && Number(merged.residualValue) >= Number(merged.acquisitionCost)) throw new Error("Nilai residu harus lebih kecil dari biaya perolehan.");
  const status = before.status === "DISPOSED" ? "DISPOSED" : missingAssetFields(merged).length ? "DRAFT" : before.status === "FULLY_DEPRECIATED" ? "FULLY_DEPRECIATED" : "ACTIVE";
  return prisma.fixedAsset.update({ where: { id }, data: { ...data, status } });
}

export async function accumulatedDepreciation(assetIds: string[]) {
  if (!assetIds.length) return new Map<string, number>();
  const rows = await prisma.journalEntry.findMany({
    where: { sourceType: "FIXED_ASSET", postingType: "DEPRECIATION", status: "POSTED", OR: assetIds.map((id) => ({ sourceId: { startsWith: `${id}:` } })) },
    select: { sourceId: true, totalDebit: true }
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const id = (r.sourceId ?? "").split(":")[0];
    map.set(id, (map.get(id) ?? 0) + Number(r.totalDebit));
  }
  return map;
}

export async function listFixedAssets() {
  const assets = await prisma.fixedAsset.findMany({ orderBy: [{ status: "asc" }, { assetNumber: "asc" }] });
  const acc = await accumulatedDepreciation(assets.map((a) => a.id));
  return assets.map((a) => {
    const accumulated = acc.get(a.id) ?? 0;
    return {
      ...a,
      acquisitionCost: Number(a.acquisitionCost),
      residualValue: a.residualValue == null ? null : Number(a.residualValue),
      accumulated,
      bookValue: Number(a.acquisitionCost) - accumulated,
      missing: missingAssetFields(a)
    };
  });
}

/** Posting penyusutan satu bulan untuk semua aset lengkap. Aman diulang (satu jurnal per aset per bulan). */
export async function postDepreciation(period: string, actor: { id: string; name: string; role: Role }) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Periode harus berformat YYYY-MM.");
  const assets = await prisma.fixedAsset.findMany({ where: { status: { in: ["ACTIVE", "DRAFT"] } } });
  const expense = await accountForRole("DEPRECIATION_EXPENSE");
  const contra = await accountForRole("ACCUMULATED_DEPRECIATION");
  const [y, m] = period.split("-").map(Number);
  const entryDate = new Date(Date.UTC(y, m, 0));
  const result = { posted: 0, skippedIncomplete: [] as Array<{ assetNumber: string; missing: string[] }>, total: 0 };
  for (const a of assets) {
    const missing = missingAssetFields(a);
    if (missing.length) {
      result.skippedIncomplete.push({ assetNumber: a.assetNumber, missing });
      continue;
    }
    const amount = depreciationForMonth(a, period);
    if (amount <= 0) continue;
    const memo = `Penyusutan ${a.assetNumber} ${a.name} ${period}`;
    const sourceId = `${a.id}:${period}`;
    const already = await prisma.journalEntry.findUnique({ where: { sourceType_sourceId_postingType: { sourceType: "FIXED_ASSET", sourceId, postingType: "DEPRECIATION" } } });
    if (already) continue;
    const journal = await postJournalEntry({
      entryDate, sourceType: "FIXED_ASSET", sourceId, postingType: "DEPRECIATION", description: memo,
      lines: [lineFor(expense, amount, 0, memo), lineFor(contra, 0, amount, memo)]
    }, actor);
    if (journal) {
      result.posted += 1;
      result.total += amount;
    }
    const lastMonth = monthIndex(period) - monthIndex(monthKey(a.availableForUseDate!)) >= a.usefulLifeMonths! - 1;
    if (lastMonth) await prisma.fixedAsset.update({ where: { id: a.id }, data: { status: "FULLY_DEPRECIATED" } });
  }
  return result;
}
