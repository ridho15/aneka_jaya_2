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
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const mocks = vi.hoisted(() => {
  const state: { actor: { id: string; name: string; role: Role }; users: FakeUser[] } = {
    actor: { id: "owner-sso", name: "Owner", role: "OWNER" },
    users: []
  };
  const now = () => new Date("2026-06-27T00:00:00.000Z");
  return {
    state,
    recordAudit: vi.fn(),
    prisma: {
      user: {
        count: vi.fn(async ({ where }: { where?: { role?: Role; isActive?: boolean; id?: { not?: string } } } = {}) => state.users.filter((user) =>
          (!where?.role || user.role === where.role) &&
          (typeof where?.isActive !== "boolean" || user.isActive === where.isActive) &&
          (!where?.id?.not || user.id !== where.id.not)
        ).length),
        findMany: vi.fn(async () => state.users),
        findUnique: vi.fn(async ({ where }: { where: { id?: string; externalId?: string } }) => state.users.find((user) => user.id === where.id || user.externalId === where.externalId) || null),
        create: vi.fn(async ({ data }: { data: Partial<FakeUser> }) => {
          const user = { id: String(data.id), externalId: String(data.externalId), email: data.email ?? null, name: String(data.name), role: data.role as Role, isActive: data.isActive ?? true, lastLoginAt: null, createdAt: now(), updatedAt: now() };
          state.users.push(user);
          return user;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
          const index = state.users.findIndex((user) => user.id === where.id);
          if (index < 0) throw new Error("Not found");
          state.users[index] = { ...state.users[index], ...data, updatedAt: now() };
          return state.users[index];
        })
      }
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mocks.state.actor)
}));

import { createUser, listUsers, updateUser } from "@/lib/users/store";

function fakeUser(input: Partial<FakeUser> & Pick<FakeUser, "id" | "externalId" | "role">): FakeUser {
  const date = new Date("2026-06-27T00:00:00.000Z");
  return { email: null, name: input.externalId, isActive: true, lastLoginAt: null, createdAt: date, updatedAt: date, ...input };
}

describe("user management store", () => {
  beforeEach(() => {
    mocks.state.actor = { id: "owner-sso", name: "Owner", role: "OWNER" };
    mocks.state.users = [fakeUser({ id: "u-owner", externalId: "owner-sso", role: "OWNER", name: "Owner" })];
    mocks.recordAudit.mockReset();
  });

  it("rejects users without users.manage", async () => {
    mocks.state.actor = { id: "admin-sso", name: "Admin", role: "ADMIN" };

    await expect(listUsers()).rejects.toThrow("Tidak punya akses kelola user.");
  });

  it("allows owner to create users and records audit", async () => {
    const user = await createUser({ externalId: "finance-sso", email: "FINANCE@EXAMPLE.COM", name: "Finance", role: "FINANCE" });

    expect(user).toMatchObject({ externalId: "finance-sso", email: "finance@example.com", name: "Finance", role: "FINANCE", isActive: true });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "user", action: "create" }));
  });

  it("allows owner to change roles", async () => {
    mocks.state.users.push(fakeUser({ id: "u-fin", externalId: "finance-sso", role: "FINANCE", name: "Finance" }));

    const user = await updateUser("u-fin", { name: "Finance", role: "MANAGER", isActive: true });

    expect(user.role).toBe("MANAGER");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "user", action: "update" }));
  });

  it("prevents users from disabling themselves", async () => {
    await expect(updateUser("u-owner", { name: "Owner", role: "OWNER", isActive: false })).rejects.toThrow("User tidak boleh menonaktifkan dirinya sendiri.");
  });

  it("prevents disabling or demoting the last active owner", async () => {
    mocks.state.actor = { id: "manager-sso", name: "Manager", role: "OWNER" };

    await expect(updateUser("u-owner", { name: "Owner", role: "ADMIN", isActive: true })).rejects.toThrow("Owner aktif terakhir tidak boleh dinonaktifkan atau diturunkan role-nya.");
  });
});
