import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { APP_SETTING_MIGRATION_MESSAGE, isMissingAppSettingTableError } from "@/lib/db/migrationHealth";

export const SLM_GROSS_PROFIT_PERCENT_KEY = "slm_gross_profit_percent";
export const DEFAULT_SLM_GROSS_PROFIT_PERCENT = 0;

export type SlmProfitSetting = {
  grossProfitPercent: number;
};

function cleanPercent(value: unknown) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return DEFAULT_SLM_GROSS_PROFIT_PERCENT;
  return Math.min(100, Math.max(0, percent));
}

export function normalizeSlmProfitSetting(value?: string | number | null): SlmProfitSetting {
  return { grossProfitPercent: cleanPercent(value ?? DEFAULT_SLM_GROSS_PROFIT_PERCENT) };
}

export async function getSlmProfitSetting(): Promise<SlmProfitSetting> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SLM_GROSS_PROFIT_PERCENT_KEY } });
    return normalizeSlmProfitSetting(row?.value);
  } catch {
    return normalizeSlmProfitSetting();
  }
}

export async function updateSlmProfitSetting(grossProfitPercent: number): Promise<SlmProfitSetting> {
  const next = normalizeSlmProfitSetting(grossProfitPercent);
  if (next.grossProfitPercent !== grossProfitPercent) throw new Error("Persentase Gross Profit SLM harus antara 0 sampai 100.");

  const user = await getCurrentUser();
  const before = await getSlmProfitSetting();
  try {
    await prisma.appSetting.upsert({
      where: { key: SLM_GROSS_PROFIT_PERCENT_KEY },
      create: {
        key: SLM_GROSS_PROFIT_PERCENT_KEY,
        value: String(next.grossProfitPercent),
        description: "Persentase estimasi Gross Profit SLM berbasis omzet.",
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
    entityId: SLM_GROSS_PROFIT_PERCENT_KEY,
    action: "update",
    beforeValue: before,
    afterValue: next,
    reason: "Update persentase Gross Profit SLM"
  });
  return next;
}
