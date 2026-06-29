import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

import { requirePermission } from "@/lib/auth/requirePermission";

describe("requirePermission", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.redirect.mockClear();
  });

  it("allows roles with the requested permission", async () => {
    mocks.role = "ADMIN";

    await expect(requirePermission("penjualan.create")).resolves.toBe("ADMIN");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects roles without the requested permission", async () => {
    mocks.role = "FINANCE";

    await expect(requirePermission("penjualan.create", "/no-access")).rejects.toThrow("NEXT_REDIRECT:/no-access");
    expect(mocks.redirect).toHaveBeenCalledWith("/no-access");
  });

  it("allows any matching permission from a list", async () => {
    mocks.role = "FINANCE";

    await expect(requirePermission(["tempo.view", "reports.view"])).resolves.toBe("FINANCE");
  });

  it("uses the provided fallback for alternate permission lists", async () => {
    mocks.role = "MANAGER";

    await expect(requirePermission(["settings.view", "users.manage"], "/settings")).rejects.toThrow("NEXT_REDIRECT:/settings");
  });
});
