import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { can, parseRole, type Role } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

export type ManagedUser = {
  id: string;
  externalId: string;
  email?: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserInput = {
  externalId?: unknown;
  email?: unknown;
  name?: unknown;
  role?: unknown;
  isActive?: unknown;
};

export class UserForbiddenError extends Error {
  constructor(message = "Tidak punya akses kelola user.") {
    super(message);
    this.name = "UserForbiddenError";
  }
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email || null;
}

function normalizeUserInput(input: UserInput, options?: { requireExternalId?: boolean; requireRole?: boolean }) {
  const externalId = typeof input.externalId === "string" ? input.externalId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const role = parseRole(typeof input.role === "string" ? input.role : undefined, "VIEWER");
  if (options?.requireExternalId && !externalId) throw new Error("External ID wajib diisi.");
  if (!name) throw new Error("Nama user wajib diisi.");
  if (options?.requireRole && !input.role) throw new Error("Role user wajib diisi.");
  return {
    externalId,
    email: normalizeEmail(input.email),
    name,
    role,
    isActive: typeof input.isActive === "boolean" ? input.isActive : true
  };
}

async function assertCanManageUsers() {
  const actor = await getCurrentUser();
  if (!can(actor.role, "users.manage")) throw new UserForbiddenError();
  return actor;
}

async function ownerCountExcluding(userId?: string) {
  return prisma.user.count({
    where: {
      role: "OWNER",
      isActive: true,
      ...(userId ? { id: { not: userId } } : {})
    }
  });
}

export async function listUsers(): Promise<ManagedUser[]> {
  await assertCanManageUsers();
  return prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
}

export async function createUser(input: UserInput | null): Promise<ManagedUser> {
  await assertCanManageUsers();
  const data = normalizeUserInput(input || {}, { requireExternalId: true, requireRole: true });
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      externalId: data.externalId,
      email: data.email,
      name: data.name,
      role: data.role,
      isActive: data.isActive
    }
  });
  await recordAudit({ entityType: "user", entityId: user.id, action: "create", afterValue: user, reason: "User baru ditambahkan" });
  return user;
}

export async function updateUser(id: string, input: UserInput | null): Promise<ManagedUser> {
  const actor = await assertCanManageUsers();
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new Error("User tidak ditemukan.");
  const body = input || {};
  const data = normalizeUserInput({ ...before, ...body }, { requireRole: true });
  const nextIsActive = typeof body.isActive === "boolean" ? body.isActive : before.isActive;
  const nextRole = body.role ? data.role : before.role;
  if (before.externalId === actor.id && before.isActive && !nextIsActive) throw new Error("User tidak boleh menonaktifkan dirinya sendiri.");
  if (before.role === "OWNER" && before.isActive && (!nextIsActive || nextRole !== "OWNER")) {
    const remainingOwners = await ownerCountExcluding(before.id);
    if (remainingOwners === 0) throw new Error("Owner aktif terakhir tidak boleh dinonaktifkan atau diturunkan role-nya.");
  }
  const after = await prisma.user.update({
    where: { id },
    data: {
      email: data.email,
      name: data.name,
      role: nextRole,
      isActive: nextIsActive
    }
  });
  const action = before.isActive !== after.isActive ? (after.isActive ? "enable" : "disable") : "update";
  await recordAudit({ entityType: "user", entityId: after.id, action, beforeValue: before, afterValue: after, reason: "User management update" });
  return after;
}
