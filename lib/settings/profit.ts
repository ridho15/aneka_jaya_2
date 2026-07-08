import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { APP_SETTING_MIGRATION_MESSAGE, isMissingAppSettingTableError } from "@/lib/db/migrationHealth";

export const OPERATIONAL_GROSS_PROFIT_PERCENT_KEY = "operational_gross_profit_percent";
export const LEGACY_SLM_GROSS_PROFIT_PERCENT_KEY = "slm_gross_profit_percent";
export const DEFAULT_OPERATIONAL_GROSS_PROFIT_PERCENT = 0;

export type OperationalProfitSetting = {
  grossProfitPercent: number;
};

function cleanPercent(value: unknown) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return DEFAULT_OPERATIONAL_GROSS_PROFIT_PERCENT;
  return Math.min(100, Math.max(0, percent));
}

export function normalizeOperationalProfitSetting(value?: string | number | null): OperationalProfitSetting {
  return { grossProfitPercent: cleanPercent(value ?? DEFAULT_OPERATIONAL_GROSS_PROFIT_PERCENT) };
}

export async function getOperationalProfitSetting(): Promise<OperationalProfitSetting> {
  try {
    const row = await prisma.appSetting.findFirst({
      where: { key: { in: [OPERATIONAL_GROSS_PROFIT_PERCENT_KEY, LEGACY_SLM_GROSS_PROFIT_PERCENT_KEY] } },
      orderBy: { key: "asc" }
    });
    return normalizeOperationalProfitSetting(row?.value);
  } catch {
    return normalizeOperationalProfitSetting();
  }
}

export async function updateOperationalProfitSetting(grossProfitPercent: number): Promise<OperationalProfitSetting> {
  const next = normalizeOperationalProfitSetting(grossProfitPercent);
  if (next.grossProfitPercent !== grossProfitPercent) throw new Error("Persentase Gross Profit Operasional harus antara 0 sampai 100.");

  const user = await getCurrentUser();
  const before = await getOperationalProfitSetting();
  try {
    await prisma.appSetting.upsert({
      where: { key: OPERATIONAL_GROSS_PROFIT_PERCENT_KEY },
      create: {
        key: OPERATIONAL_GROSS_PROFIT_PERCENT_KEY,
        value: String(next.grossProfitPercent),
        description: "Persentase estimasi Gross Profit Operasional berbasis omzet.",
        updatedByUserId: user.id,
        updatedByNameSnapshot: user.name
      },
      update: {
        value: String(next.grossProfitPercent),
        updatedByUserId: user.id,
        updatedByNameSnapshot: user.name
      }
    });
  } catch (error) {
    if (isMissingAppSettingTableError(error)) throw new Error(APP_SETTING_MIGRATION_MESSAGE);
    throw error;
  }
  await recordAudit({
    entityType: "app_setting",
    entityId: OPERATIONAL_GROSS_PROFIT_PERCENT_KEY,
    action: "update",
    beforeValue: before,
    afterValue: next,
    reason: "Update persentase Gross Profit Operasional"
  });
  return next;
}

export const SLM_GROSS_PROFIT_PERCENT_KEY = LEGACY_SLM_GROSS_PROFIT_PERCENT_KEY;
export const DEFAULT_SLM_GROSS_PROFIT_PERCENT = DEFAULT_OPERATIONAL_GROSS_PROFIT_PERCENT;
export type SlmProfitSetting = OperationalProfitSetting;
export const normalizeSlmProfitSetting = normalizeOperationalProfitSetting;
export const getSlmProfitSetting = getOperationalProfitSetting;
export const updateSlmProfitSetting = updateOperationalProfitSetting;
