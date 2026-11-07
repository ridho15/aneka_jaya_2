/** Regresi audit keamanan: kelola user hanya Super Admin, dan store menolak eskalasi ke OWNER. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { can, type Role } from "@/lib/auth/roles";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  type Row = { id: string; externalId: string; email: string | null; name: string; role: Role; isActive: boolean; passwordHash: string | null; passwordUpdatedAt: Date | null; failedLoginCount: number; lockedUntil: Date | null; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date };
  const state: { actor: { id: string; name: string; role: Role }; users: Row[] } = { actor: { id: "spv", name: "Spv", role: "SUPERVISOR" }, users: [] };
  const row = (id: string, role: Role): Row => ({ id, externalId: id, email: null, name: id, role, isActive: true, passwordHash: null, passwordUpdatedAt: null, failedLoginCount: 0, lockedUntil: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() });
  return {
    state, row,
    prisma: {
      user: {
        count: vi.fn(async () => state.users.filter((u) => u.role === "OWNER" && u.isActive).length),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.users.find((u) => u.id === where.id) ?? null),
        create: vi.fn(async ({ data }: { data: Row }) => { const u = { ...row(String(data.externalId), data.role), ...data }; state.users.push(u); return u; }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => { const u = state.users.find((x) => x.id === where.id)!; Object.assign(u, data); return u; })
      }
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.state.actor) }));
// Store-level ceiling diuji dengan role non-OWNER yang (seandainya) punya users.manage.
vi.mock("@/lib/auth/roles", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/roles")>();
  return { ...actual, can: (role: Role, p: Parameters<typeof actual.can>[1]) => (p === "users.manage" && role === "SUPERVISOR") || actual.can(role, p) };
});

import { createUser, updateUser } from "@/lib/users/store";

describe("users.manage permission", () => {
  it("is Super Admin only", async () => {
    const real = await vi.importActual<typeof import("@/lib/auth/roles")>("@/lib/auth/roles");
    expect(real.can("OWNER", "users.manage")).toBe(true);
    for (const role of ["SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "DELIVERY_DRIVER", "VIEWER"] as const) {
      expect(real.can(role, "users.manage")).toBe(false);
    }
    expect(can).toBeTypeOf("function");
  });
});

describe("user store role ceiling for non-owner managers", () => {
  beforeEach(() => {
    mocks.state.actor = { id: "spv", name: "Spv", role: "SUPERVISOR" };
    mocks.state.users = [mocks.row("boss", "OWNER"), mocks.row("spv", "SUPERVISOR"), mocks.row("fin", "FINANCE")];
  });

  it("cannot promote itself", async () => {
    await expect(updateUser("spv", { name: "Spv", role: "OWNER" })).rejects.toThrow();
    expect(mocks.state.users.find((u) => u.id === "spv")!.role).toBe("SUPERVISOR");
  });

  it("cannot reset the owner's password or edit the owner", async () => {
    await expect(updateUser("boss", { name: "Boss", role: "OWNER", password: "taken-over-1" })).rejects.toThrow();
    expect(mocks.state.users.find((u) => u.id === "boss")!.passwordHash).toBeNull();
  });

  it("cannot create an owner account or grant owner to someone else", async () => {
    await expect(createUser({ externalId: "alt", name: "Alt", role: "OWNER", password: "alt-password-1" })).rejects.toThrow();
    await expect(updateUser("fin", { name: "fin", role: "OWNER" })).rejects.toThrow();
  });

  it("an owner can still grant owner", async () => {
    mocks.state.actor = { id: "boss", name: "Boss", role: "OWNER" };
    await expect(updateUser("fin", { name: "fin", role: "OWNER" })).resolves.toMatchObject({ role: "OWNER" });
  });
});
