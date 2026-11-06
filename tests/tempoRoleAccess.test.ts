import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/roles";

describe("Tempo access by role", () => {
  it("Manager and Admin only see the due-soon list, not the summary", () => {
    for (const role of ["MANAGER", "ADMIN"] as const) {
      expect(can(role, "tempo.view")).toBe(false);
      expect(can(role, "tempo.view_due")).toBe(true);
    }
  });
  it("Super Admin keeps the full Tempo page", () => {
    expect(can("OWNER", "tempo.view")).toBe(true);
  });
});
