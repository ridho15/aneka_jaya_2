import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/roles";

describe("inactive modules", () => {
  it("does not expose the deferred purchase module as an active permission", () => {
    expect(ALL_PERMISSIONS.some((permission) => String(permission).startsWith("pembelian."))).toBe(false);
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(permissions.some((permission) => String(permission).startsWith("pembelian."))).toBe(false);
    }
  });

  it("does not render a purchase navigation entry", async () => {
    const sidebar = await readFile(path.join(process.cwd(), "components/layout/Sidebar.tsx"), "utf8");
    expect(sidebar).not.toContain("/pembelian");
    expect(sidebar).not.toContain("Input Pembelian");
  });
});
