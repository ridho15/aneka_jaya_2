import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Status PKP usaha. Selama belum diverifikasi pemilik, aturan lama tetap berlaku (tidak diasumsikan).
 * NON_PKP sejak tanggal efektif: penjualan tidak memungut PPN keluaran, dan PPN pembelian tidak dikreditkan
 * melainkan masuk ke biaya barang/aset/beban sesuai transaksinya. PPh tidak diatur di sini.
 */
export type TaxStatus = { status: "PKP" | "NON_PKP"; effectiveDate: string; verifiedBy: string; verifiedAt: string };

const KEY = "tax.pkp_status";

export async function getTaxStatus(): Promise<TaxStatus | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as TaxStatus;
    return parsed.status && parsed.effectiveDate ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveTaxStatus(input: { status: "PKP" | "NON_PKP"; effectiveDate: string }, actor: { id: string; name: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) throw new Error("Tanggal efektif harus YYYY-MM-DD.");
  const value: TaxStatus = { ...input, verifiedBy: actor.name, verifiedAt: new Date().toISOString() };
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(value), description: "Status PKP usaha dan tanggal efektifnya", updatedByUserId: actor.id, updatedByNameSnapshot: actor.name },
    update: { value: JSON.stringify(value), updatedByUserId: actor.id, updatedByNameSnapshot: actor.name }
  });
  return value;
}

/** true bila pada tanggal itu usaha berstatus Non-PKP menurut data yang sudah diverifikasi. */
export async function isNonPkpOn(date: Date | string) {
  const status = await getTaxStatus();
  if (!status || status.status !== "NON_PKP") return false;
  const d = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return d >= status.effectiveDate;
}
