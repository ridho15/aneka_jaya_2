import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  cookies: vi.fn(),
  findActiveUserByExternalId: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies
}));

vi.mock("@/lib/users/authLookup", () => ({
  findActiveUserByExternalId: mocks.findActiveUserByExternalId
}));

import { getCurrentUser } from "@/lib/auth/session";

describe("trusted-header session users", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");
    vi.stubEnv("NODE_ENV", "production");
    mocks.headers.mockResolvedValue(new Headers({
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "sso-1",
      "x-aneka-user-role": "OWNER"
    }));
    mocks.cookies.mockResolvedValue({ get: vi.fn() });
    mocks.findActiveUserByExternalId.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the database role instead of the trusted role header", async () => {
    mocks.findActiveUserByExternalId.mockResolvedValue({ id: "sso-1", name: "Finance DB", role: "FINANCE" });

    await expect(getCurrentUser()).resolves.toEqual({ id: "sso-1", name: "Finance DB", role: "FINANCE" });
    expect(mocks.findActiveUserByExternalId).toHaveBeenCalledWith("sso-1", { touchLastLogin: true });
  });

  it("returns viewer when the trusted-header user is not found or inactive", async () => {
    mocks.findActiveUserByExternalId.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "unauthenticated", role: "VIEWER" });
  });

  it("allows trusted role headers only for explicit development visual fallback", async () => {
    vi.stubEnv("AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");
    mocks.findActiveUserByExternalId.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toEqual({ id: "sso-1", name: "Super Admin", role: "OWNER" });
  });

  it("returns viewer when the trusted-header secret is invalid", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      "x-aneka-auth-secret": "wrong",
      "x-aneka-user-id": "sso-1",
      "x-aneka-user-role": "OWNER"
    }));

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "unauthenticated", role: "VIEWER" });
    expect(mocks.findActiveUserByExternalId).not.toHaveBeenCalled();
  });
});
