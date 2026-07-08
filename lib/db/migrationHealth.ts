import "server-only";
import { prisma } from "@/lib/db/prisma";

export const APP_SETTING_MIGRATION_MESSAGE = "Database belum dimigrasi. Jalankan npx prisma migrate deploy lalu restart aplikasi.";

export function isMissingAppSettingTableError(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  const message = String(candidate?.message || "");
  return candidate?.code === "P2021" || (message.includes("AppSetting") && (message.includes("does not exist") || message.includes("doesn't exist")));
}

export async function checkAppSettingTable() {
  try {
    await prisma.appSetting.findUnique({ where: { key: "slm_gross_profit_percent" } });
    return { ready: true, message: "AppSetting siap digunakan." };
  } catch (error) {
    if (isMissingAppSettingTableError(error)) return { ready: false, message: APP_SETTING_MIGRATION_MESSAGE };
    return { ready: false, message: "Status AppSetting belum bisa diverifikasi." };
  }
}
