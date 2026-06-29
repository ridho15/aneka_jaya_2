import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, can, roleLabel } from "@/lib/auth/roles";

describe("Super Admin permission contract", () => {
  it("maps OWNER to the Super Admin UI label", () => {
    expect(roleLabel("OWNER")).toBe("Super Admin");
  });

  it("grants OWNER every declared permission", () => {
    expect(new Set(ROLE_PERMISSIONS.OWNER)).toEqual(new Set(ALL_PERMISSIONS));
    for (const permission of ALL_PERMISSIONS) expect(can("OWNER", permission)).toBe(true);
  });

  it("grants read-only expense and master data permissions to operational roles", () => {
    for (const role of ["ADMIN", "FINANCE", "MANAGER"] as const) {
      expect(can(role, "pengeluaran.view")).toBe(true);
      expect(can(role, "master_data.view")).toBe(true);
    }
    expect(can("VIEWER", "pengeluaran.view")).toBe(false);
    expect(can("VIEWER", "master_data.view")).toBe(false);
  });

  it("keeps expense creation limited to admin and finance roles", () => {
    expect(can("ADMIN", "pengeluaran.create")).toBe(true);
    expect(can("FINANCE", "pengeluaran.create")).toBe(true);
    expect(can("MANAGER", "pengeluaran.create")).toBe(false);
    expect(can("VIEWER", "pengeluaran.create")).toBe(false);
  });
});
