import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jakartaMonthKey } from "@/lib/date/jakarta";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export async function assertPeriodOpen(dateValue: Date | string): Promise<string> {
  const periodKey = jakartaMonthKey(dateValue);
  const period = await prisma.accountingPeriod.findUnique({
    where: { periodKey }
  });

  if (period && period.isClosed) {
    throw new Error(
      `Periode akuntansi ${periodKey} telah ditutup (closed). Transaksi, entri jurnal, atau pembatalan pada periode yang sudah ditutup tidak diperbolehkan.`
    );
  }

  return periodKey;
}

export async function listAccountingPeriods() {
  return prisma.accountingPeriod.findMany({
    orderBy: { periodKey: "desc" }
  });
}

export async function closeAccountingPeriod(
  periodKey: string,
  actor: { id: string; name: string; role: Role },
  notes?: string
) {
  const period = await prisma.accountingPeriod.upsert({
    where: { periodKey },
    create: {
      periodKey,
      isClosed: true,
      closedAt: new Date(),
      closedByUserId: actor.id,
      closedByNameSnapshot: actor.name,
      notes: notes?.trim() || null
    },
    update: {
      isClosed: true,
      closedAt: new Date(),
      closedByUserId: actor.id,
      closedByNameSnapshot: actor.name,
      notes: notes?.trim() || null
    }
  });

  await recordAudit({
    entityType: "app_setting",
    entityId: `period_${periodKey}`,
    action: "update",
    afterValue: period,
    reason: `Tutup periode akuntansi: ${periodKey}${notes ? ` - Catatan: ${notes}` : ""}`
  });

  return period;
}

export async function reopenAccountingPeriod(
  periodKey: string,
  actor: { id: string; name: string; role: Role },
  reason: string
) {
  const period = await prisma.accountingPeriod.update({
    where: { periodKey },
    data: {
      isClosed: false,
      closedAt: null,
      closedByUserId: null,
      closedByNameSnapshot: null,
      notes: `Dibuka kembali: ${reason}`
    }
  });

  await recordAudit({
    entityType: "app_setting",
    entityId: `period_${periodKey}`,
    action: "update",
    afterValue: period,
    reason: `Buka kembali periode akuntansi: ${periodKey}. Alasan: ${reason}`
  });

  return period;
}
