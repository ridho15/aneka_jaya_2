import { describe, expect, it } from "vitest";
import { canListProducts, canUploadAttachment } from "@/lib/auth/apiPermissions";
import type { Role } from "@/lib/auth/roles";

const roles: Role[] = ["OWNER", "ADMIN", "FINANCE", "MANAGER", "VIEWER"];

describe("api permissions", () => {
  it("allows attachment uploads only for transaction/payment roles", () => {
    const result = Object.fromEntries(roles.map((role) => [role, canUploadAttachment(role)]));
    expect(result).toEqual({
      OWNER: true,
      ADMIN: true,
      FINANCE: true,
      MANAGER: false,
      VIEWER: false
    });
  });

  it("allows product listing only for roles with stock.view", () => {
    const result = Object.fromEntries(roles.map((role) => [role, canListProducts(role)]));
    expect(result).toEqual({
      OWNER: true,
      ADMIN: true,
      FINANCE: false,
      MANAGER: false,
      VIEWER: false
    });
  });
});
