import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/store";
import { APP_SETTING_MIGRATION_MESSAGE, isMissingAppSettingTableError } from "@/lib/db/migrationHealth";
import { prisma } from "@/lib/db/prisma";

export const ERP_SYNC_AFTER_SALES_EDIT_KEY = "erp_sync_after_sales_edit_enabled";

export type ErpSyncSetting = {
  autoSyncAfterSalesEdit: boolean;
};

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

export function normalizeErpSyncSetting(value?: string | boolean | null): ErpSyncSetting {
  return { autoSyncAfterSalesEdit: cleanBoolean(value) };
}

export async function getErpSyncSetting(): Promise<ErpSyncSetting> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ERP_SYNC_AFTER_SALES_EDIT_KEY } });
    return normalizeErpSyncSetting(row?.value);
  } catch {
    return normalizeErpSyncSetting();
  }
}

export async function updateErpSyncSetting(input: ErpSyncSetting): Promise<ErpSyncSetting> {
  const next = normalizeErpSyncSetting(input.autoSyncAfterSalesEdit);
  const user = await getCurrentUser();
  const before = await getErpSyncSetting();
  try {
    await prisma.appSetting.upsert({
      where: { key: ERP_SYNC_AFTER_SALES_EDIT_KEY },
      create: {
        key: ERP_SYNC_AFTER_SALES_EDIT_KEY,
        value: String(next.autoSyncAfterSalesEdit),
        description: "Auto retry sinkronisasi ERP setelah transaksi penjualan ERP diedit.",
        updatedByUserId: user.id,
        updatedByNameSnapshot: user.name
      },
      update: {
        value: String(next.autoSyncAfterSalesEdit),
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
    entityId: ERP_SYNC_AFTER_SALES_EDIT_KEY,
    action: "update",
    beforeValue: before,
    afterValue: next,
    reason: "Update setting auto ERP Sync penjualan"
  });
  return next;
}
