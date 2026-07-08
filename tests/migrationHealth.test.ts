import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { APP_SETTING_MIGRATION_MESSAGE, isMissingAppSettingTableError } from "@/lib/db/migrationHealth";

describe("migration health helpers", () => {
  it("detects missing AppSetting table errors without exposing raw Prisma details", () => {
    expect(isMissingAppSettingTableError({ code: "P2021", message: "The table `public.AppSetting` does not exist in the current database." })).toBe(true);
    expect(isMissingAppSettingTableError(new Error("The table `public.AppSetting` does not exist in the current database."))).toBe(true);
    expect(isMissingAppSettingTableError(new Error("connection refused"))).toBe(false);
    expect(APP_SETTING_MIGRATION_MESSAGE).toBe("Database belum dimigrasi. Jalankan npx prisma migrate deploy lalu restart aplikasi.");
  });
});
