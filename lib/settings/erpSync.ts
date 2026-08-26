import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/store";
import { APP_SETTING_MIGRATION_MESSAGE, isMissingAppSettingTableError } from "@/lib/db/migrationHealth";
import { prisma } from "@/lib/db/prisma";

export const ERP_SYNC_AFTER_SALES_EDIT_KEY = "erp_sync_after_sales_edit_enabled";
export const ERP_TRANSACTION_SYNC_ENABLED_KEY = "erp_transaction_sync_enabled";
export const MJ_TRANSACTION_MODE_KEY = "mj_transaction_mode";

export type MjTransactionMode = "disabled" | "record_only" | "process_aj";

export type ErpSyncSetting = {
  autoSyncAfterSalesEdit: boolean;
  erpTransactionSyncEnabled: boolean;
  mjTransactionMode: MjTransactionMode;
};

function cleanBoolean(value: unknown, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "") return defaultValue;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function cleanMjMode(value: unknown, fallback: MjTransactionMode = "disabled"): MjTransactionMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "off") return "disabled";
  if (normalized === "record_only" || normalized === "local") return "record_only";
  if (normalized === "process_aj" || normalized === "full") return "process_aj";
  return fallback;
}

export function normalizeErpSyncSetting(input?: {
  autoSyncAfterSalesEdit?: unknown;
  erpTransactionSyncEnabled?: unknown;
  mjTransactionMode?: unknown;
} | null): ErpSyncSetting {
  const defaultSyncEnabled = process.env.ENABLE_ERP_TRANSACTION_SYNC !== "false";
  const defaultMjMode = (process.env.MJ_TRANSACTION_MODE as MjTransactionMode) || (defaultSyncEnabled ? "process_aj" : "disabled");

  return {
    autoSyncAfterSalesEdit: cleanBoolean(input?.autoSyncAfterSalesEdit, false),
    erpTransactionSyncEnabled: cleanBoolean(input?.erpTransactionSyncEnabled, defaultSyncEnabled),
    mjTransactionMode: cleanMjMode(input?.mjTransactionMode, defaultMjMode),
  };
}

export async function getErpSyncSetting(): Promise<ErpSyncSetting> {
  try {
    let autoSyncVal: string | undefined;
    let erpSyncVal: string | undefined;
    let mjModeVal: string | undefined;

    if (typeof prisma.appSetting?.findMany === "function") {
      const rows = await prisma.appSetting.findMany({
        where: {
          key: {
            in: [
              ERP_SYNC_AFTER_SALES_EDIT_KEY,
              ERP_TRANSACTION_SYNC_ENABLED_KEY,
              MJ_TRANSACTION_MODE_KEY,
            ],
          },
        },
      });
      const map = new Map(rows.map((r) => [r.key, r.value]));
      autoSyncVal = map.get(ERP_SYNC_AFTER_SALES_EDIT_KEY);
      erpSyncVal = map.get(ERP_TRANSACTION_SYNC_ENABLED_KEY);
      mjModeVal = map.get(MJ_TRANSACTION_MODE_KEY);
    } else if (typeof prisma.appSetting?.findUnique === "function") {
      const row = await prisma.appSetting.findUnique({
        where: { key: ERP_SYNC_AFTER_SALES_EDIT_KEY },
      });
      autoSyncVal = row?.value;
    }

    return normalizeErpSyncSetting({
      autoSyncAfterSalesEdit: autoSyncVal,
      erpTransactionSyncEnabled: erpSyncVal,
      mjTransactionMode: mjModeVal,
    });
  } catch {
    return normalizeErpSyncSetting();
  }
}

export async function isErpTransactionSyncEnabled(): Promise<boolean> {
  const settings = await getErpSyncSetting();
  return settings.erpTransactionSyncEnabled;
}

export async function getMjTransactionMode(): Promise<MjTransactionMode> {
  const settings = await getErpSyncSetting();
  return settings.mjTransactionMode;
}

export async function updateErpSyncSetting(input: Partial<ErpSyncSetting>): Promise<ErpSyncSetting> {
  const before = await getErpSyncSetting();
  const next = normalizeErpSyncSetting({
    autoSyncAfterSalesEdit: input.autoSyncAfterSalesEdit !== undefined ? input.autoSyncAfterSalesEdit : before.autoSyncAfterSalesEdit,
    erpTransactionSyncEnabled: input.erpTransactionSyncEnabled !== undefined ? input.erpTransactionSyncEnabled : before.erpTransactionSyncEnabled,
    mjTransactionMode: input.mjTransactionMode !== undefined ? input.mjTransactionMode : before.mjTransactionMode,
  });

  const user = await getCurrentUser();
  const upsertTask = (key: string, value: string, desc: string) =>
    prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value,
        description: desc,
        updatedByUserId: user.id,
        updatedByNameSnapshot: user.name,
      },
      update: {
        value,
        updatedByUserId: user.id,
        updatedByNameSnapshot: user.name,
      },
    });

  try {
    if (typeof prisma.$transaction === "function") {
      await prisma.$transaction([
        upsertTask(ERP_SYNC_AFTER_SALES_EDIT_KEY, String(next.autoSyncAfterSalesEdit), "Auto retry sinkronisasi ERP setelah transaksi penjualan ERP diedit."),
        upsertTask(ERP_TRANSACTION_SYNC_ENABLED_KEY, String(next.erpTransactionSyncEnabled), "Status koneksi sinkronisasi transaksi (penjualan/pengeluaran) ke Aneka Jaya ERP. Jika nonaktif, beroperasi dalam Mode Stok Saja."),
        upsertTask(MJ_TRANSACTION_MODE_KEY, next.mjTransactionMode, "Mode penerimaan transaksi inbound dari sistem MJ: disabled | record_only | process_aj"),
      ]);
    } else {
      await upsertTask(ERP_SYNC_AFTER_SALES_EDIT_KEY, String(next.autoSyncAfterSalesEdit), "Auto retry sinkronisasi ERP setelah transaksi penjualan ERP diedit.");
      if (input.erpTransactionSyncEnabled !== undefined) {
        await upsertTask(ERP_TRANSACTION_SYNC_ENABLED_KEY, String(next.erpTransactionSyncEnabled), "Status koneksi sinkronisasi transaksi ke Aneka Jaya ERP.");
      }
      if (input.mjTransactionMode !== undefined) {
        await upsertTask(MJ_TRANSACTION_MODE_KEY, next.mjTransactionMode, "Mode penerimaan transaksi inbound dari sistem MJ.");
      }
    }
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
    reason: "Update setting konfigurasi sinkronisasi transaksi ERP & mode MJ",
  });

  return next;
}
