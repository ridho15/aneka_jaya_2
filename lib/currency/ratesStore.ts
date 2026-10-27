import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { RateType } from "@prisma/client";
import type { CurrencyRateInput } from "@/lib/validation/purchasingSchema";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export async function listRates(filters?: {
  currency?: string;
  startDate?: string;
  endDate?: string;
  rateType?: RateType;
}) {
  if (typeof prisma?.currencyRate?.findMany !== "function") return [];

  const where: any = {};
  if (filters?.currency) {
    where.currency = filters.currency.toUpperCase();
  }
  if (filters?.rateType) {
    where.rateType = filters.rateType;
  }
  if (filters?.startDate || filters?.endDate) {
    where.rateDate = {};
    if (filters.startDate) where.rateDate.gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.rateDate.lte = end;
    }
  }

  const rates = await prisma.currencyRate.findMany({
    where,
    orderBy: [{ rateDate: "desc" }, { currency: "asc" }]
  });

  return rates.map((r) => ({
    id: r.id,
    currency: r.currency,
    rateDate: r.rateDate.toISOString(),
    rateType: r.rateType,
    rate: Number(r.rate),
    source: r.source,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  }));
}

export async function upsertRate(
  input: CurrencyRateInput,
  actor: { userId: string; role: Role }
) {
  if (typeof prisma?.currencyRate?.upsert !== "function") return null;

  const rateDate = new Date(input.rateDate);
  rateDate.setHours(0, 0, 0, 0);

  const existing = await prisma.currencyRate.findUnique({
    where: {
      currency_rateDate_rateType: {
        currency: input.currency.toUpperCase(),
        rateDate,
        rateType: input.rateType
      }
    }
  });

  const saved = await prisma.currencyRate.upsert({
    where: {
      currency_rateDate_rateType: {
        currency: input.currency.toUpperCase(),
        rateDate,
        rateType: input.rateType
      }
    },
    create: {
      currency: input.currency.toUpperCase(),
      rateDate,
      rateType: input.rateType,
      rate: input.rate,
      source: input.source || null,
      notes: input.notes || null
    },
    update: {
      rate: input.rate,
      source: input.source || null,
      notes: input.notes || null
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: saved.id,
    action: existing ? "update" : "create",
    beforeValue: existing,
    afterValue: saved,
    reason: `Set kurs ${saved.currency} (${saved.rateType}) = ${saved.rate}`
  });

  return {
    id: saved.id,
    currency: saved.currency,
    rateDate: saved.rateDate.toISOString(),
    rateType: saved.rateType,
    rate: Number(saved.rate),
    source: saved.source,
    notes: saved.notes
  };
}

export async function getLatestRate(
  currency: string,
  rateType: RateType = "BOOKING",
  targetDate?: Date | string
): Promise<number> {
  const curr = currency.toUpperCase();
  if (curr === "IDR") return 1;

  if (typeof prisma?.currencyRate?.findFirst !== "function") {
    // Fallback if not DB connected
    if (curr === "USD") return 16200;
    if (curr === "RMB" || curr === "CNY") return 2250;
    return 1;
  }

  const queryDate = targetDate ? new Date(targetDate) : new Date();

  // Try exact type on or before date
  const match = await prisma.currencyRate.findFirst({
    where: {
      currency: curr,
      rateType,
      rateDate: { lte: queryDate }
    },
    orderBy: { rateDate: "desc" }
  });

  if (match) return Number(match.rate);

  // Try any rateType on or before date
  const fallbackMatch = await prisma.currencyRate.findFirst({
    where: {
      currency: curr,
      rateDate: { lte: queryDate }
    },
    orderBy: { rateDate: "desc" }
  });

  if (fallbackMatch) return Number(fallbackMatch.rate);

  // Fallback default
  if (curr === "USD") return 16200;
  if (curr === "RMB" || curr === "CNY") return 2250;
  return 1;
}

export async function deleteRate(
  id: string,
  actor: { userId: string; role: Role }
) {
  if (typeof prisma?.currencyRate?.delete !== "function") return null;

  const existing = await prisma.currencyRate.findUnique({ where: { id } });
  if (!existing) throw new Error("Data kurs tidak ditemukan.");

  await prisma.currencyRate.delete({ where: { id } });

  await recordAudit({
    entityType: "purchase",
    entityId: id,
    action: "disable",
    beforeValue: existing,
    reason: `Hapus kurs ${existing.currency} (${existing.rateType})`
  });

  return { success: true };
}
