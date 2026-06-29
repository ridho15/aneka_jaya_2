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
});
