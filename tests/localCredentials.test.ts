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
        findMany: vi.fn(async () => (state.user ? [state.user] : [])),
        update: vi.fn(async ({ data }: { data: Partial<FakeUser> }) => {
          if (!state.user) throw new Error("No user");
          state.user = { ...state.user, ...data };
          return state.user;
        }),
        findUnique: vi.fn(async () => state.user),
        // Satu statement atomik seperti di Postgres: cek kondisi lalu tulis tanpa jeda.
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
          await new Promise((r) => setTimeout(r, Math.random() * 3));
          const u = state.user;
          const lockOk = (c: any) => c.lockedUntil === null ? u!.lockedUntil === null : c.lockedUntil?.lte ? (u!.lockedUntil !== null && u!.lockedUntil <= c.lockedUntil.lte) : true;
          const match = u && u.id === where.id
            && (where.failedLoginCount?.lt === undefined || u.failedLoginCount < where.failedLoginCount.lt)
            && (where.OR ? where.OR.some(lockOk) : lockOk(where));
          if (!match) return { count: 0 };
          const next: Record<string, any> = { ...data };
          if (data.failedLoginCount?.increment) next.failedLoginCount = u!.failedLoginCount + data.failedLoginCount.increment;
          state.user = { ...u!, ...next };
          return { count: 1 };
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
    mocks.prisma.user.findMany.mockClear();
    mocks.prisma.user.update.mockClear();
    mocks.prisma.user.updateMany.mockClear();
    mocks.prisma.auditLog.create.mockClear();
  });

  it("creates a session and returns the role landing target on valid credentials", async () => {
    await expect(loginWithPassword({ identifier: "OWNER@EXAMPLE.TEST", password: "secret123" })).resolves.toMatchObject({
      user: { id: "owner", role: "OWNER" },
      redirectTo: "/dashboard"
    });

    expect(mocks.setLocalSessionCookie).toHaveBeenCalledWith("owner", "OWNER");
    expect(mocks.state.user?.failedLoginCount).toBe(0);
    expect(mocks.prisma.auditLog.create).toHaveBeenCalled();
  });

  it("increments failed login count on invalid password", async () => {
    await expect(loginWithPassword({ identifier: "owner", password: "wrong-password" })).rejects.toThrow("Username atau password tidak valid.");

    expect(mocks.state.user?.failedLoginCount).toBe(1);
    expect(mocks.setLocalSessionCookie).not.toHaveBeenCalled();
  });

  it("locks the account after repeated invalid passwords", async () => {
    mocks.state.user = user({ failedLoginCount: 4 });

    await expect(loginWithPassword({ identifier: "owner", password: "wrong-password" })).rejects.toThrow("Username atau password tidak valid.");

    expect(mocks.state.user?.failedLoginCount).toBe(5);
    expect(mocks.state.user?.lockedUntil).toBeInstanceOf(Date);
  });

  it("caps concurrent wrong guesses at the lockout limit", async () => {
    const guesses = Array.from({ length: 30 }, (_, i) => loginWithPassword({ identifier: "owner", password: `wrong-guess-${i}` }).catch((e: Error) => e.message));
    guesses.push(loginWithPassword({ identifier: "owner", password: "secret123" }).then(() => "success", (e: Error) => e.message));
    const results = await Promise.all(guesses);
    expect(results.filter((r) => r === "Username atau password tidak valid.").length).toBeLessThanOrEqual(5);
    expect(mocks.state.user?.lockedUntil).toBeInstanceOf(Date);
  });

  it("rejects inactive users", async () => {
    mocks.state.user = user({ isActive: false });

    await expect(loginWithPassword({ identifier: "owner", password: "secret123" })).rejects.toThrow("Username atau password tidak valid.");
  });

  it("matches username case-insensitively, including ERP accounts", async () => {
    await loginWithPassword({ identifier: "  Owner ", password: "secret123" });
    const where = mocks.prisma.user.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { email: { equals: "owner", mode: "insensitive" } },
      { externalId: { equals: "owner", mode: "insensitive" } },
      { externalId: { equals: "anika:owner", mode: "insensitive" } }
    ]);
  });

  it("falls back to the email name when exactly one account matches", async () => {
    const found = mocks.state.user;
    mocks.prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(loginWithPassword({ identifier: "owner", password: "secret123" })).resolves.toMatchObject({ user: { id: "owner" } });
    expect(mocks.prisma.user.findMany.mock.calls[0][0].where).toEqual({ email: { startsWith: "owner@", mode: "insensitive" } });

    mocks.prisma.user.findFirst.mockResolvedValueOnce(null);
    mocks.prisma.user.findMany.mockResolvedValueOnce([found!, { ...found!, id: "other" }]);
    await expect(loginWithPassword({ identifier: "owner", password: "secret123" })).rejects.toThrow("Username atau password tidak valid.");
  });
});
