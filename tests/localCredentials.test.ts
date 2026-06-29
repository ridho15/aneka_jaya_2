import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/auth/roles";

vi.mock("server-only", () => ({}));

type FakeUser = {
  id: string;
  externalId: string;
  email: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
};

const mocks = vi.hoisted(() => {
  const state: { user: FakeUser | null } = { user: null };
  return {
    state,
    setLocalSessionCookie: vi.fn(),
    prisma: {
      user: {
        findFirst: vi.fn(async () => state.user),
        update: vi.fn(async ({ data }: { data: Partial<FakeUser> }) => {
          if (!state.user) throw new Error("No user");
          state.user = { ...state.user, ...data };
          return state.user;
        })
      },
      auditLog: {
        create: vi.fn(async () => ({}))
      }
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/localSession", () => ({ setLocalSessionCookie: mocks.setLocalSessionCookie }));

import { hashPassword } from "@/lib/auth/password";
import { loginWithPassword } from "@/lib/auth/localCredentials";

function user(input?: Partial<FakeUser>): FakeUser {
  return {
    id: "u-owner",
    externalId: "owner",
    email: "owner@example.test",
    name: "Owner",
    role: "OWNER",
    isActive: true,
    passwordHash: hashPassword("secret123"),
    failedLoginCount: 0,
    lockedUntil: null,
    ...input
  };
}

describe("local credentials login", () => {
  beforeEach(() => {
    mocks.state.user = user();
    mocks.setLocalSessionCookie.mockReset();
    mocks.prisma.user.findFirst.mockClear();
    mocks.prisma.user.update.mockClear();
    mocks.prisma.auditLog.create.mockClear();
  });

  it("creates a session and returns the role landing target on valid credentials", async () => {
    await expect(loginWithPassword({ identifier: "OWNER@EXAMPLE.TEST", password: "secret123" })).resolves.toMatchObject({
      user: { id: "owner", role: "OWNER" },
      redirectTo: "/dashboard"
    });

    expect(mocks.setLocalSessionCookie).toHaveBeenCalledWith("owner");
    expect(mocks.state.user?.failedLoginCount).toBe(0);
    expect(mocks.prisma.auditLog.create).toHaveBeenCalled();
  });

  it("increments failed login count on invalid password", async () => {
    await expect(loginWithPassword({ identifier: "owner", password: "wrong-password" })).rejects.toThrow("Email/username atau password tidak valid.");

    expect(mocks.state.user?.failedLoginCount).toBe(1);
    expect(mocks.setLocalSessionCookie).not.toHaveBeenCalled();
  });

  it("locks the account after repeated invalid passwords", async () => {
    mocks.state.user = user({ failedLoginCount: 4 });

    await expect(loginWithPassword({ identifier: "owner", password: "wrong-password" })).rejects.toThrow("Email/username atau password tidak valid.");

    expect(mocks.state.user?.failedLoginCount).toBe(5);
    expect(mocks.state.user?.lockedUntil).toBeInstanceOf(Date);
  });

  it("rejects inactive users", async () => {
    mocks.state.user = user({ isActive: false });

    await expect(loginWithPassword({ identifier: "owner", password: "secret123" })).rejects.toThrow("Email/username atau password tidak valid.");
  });
});
