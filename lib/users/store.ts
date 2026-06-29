import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { can, parseRole, type Role } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

export type ManagedUser = {
  id: string;
  externalId: string;
  email?: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
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
  password?: unknown;
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

function normalizePasswordInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertPasswordStrength(password: string, label = "Password") {
  if (password.length < 8) throw new Error(`${label} minimal 8 karakter.`);
}

function toManagedUser(user: {
  id: string;
  externalId: string;
  email: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  passwordHash?: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ManagedUser {
  return {
    id: user.id,
    externalId: user.externalId,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    hasPassword: Boolean(user.passwordHash),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
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
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return users.map(toManagedUser);
}

export async function createUser(input: UserInput | null): Promise<ManagedUser> {
  await assertCanManageUsers();
  const data = normalizeUserInput(input || {}, { requireExternalId: true, requireRole: true });
  const password = normalizePasswordInput(input?.password);
  if (!password) throw new Error("Password awal wajib diisi.");
  assertPasswordStrength(password, "Password awal");
  const passwordHash = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      externalId: data.externalId,
      email: data.email,
      name: data.name,
      role: data.role,
      isActive: data.isActive,
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null
    }
  });
  const safeUser = toManagedUser(user);
  await recordAudit({ entityType: "user", entityId: user.id, action: "create", afterValue: safeUser, reason: "User baru ditambahkan" });
  return safeUser;
}

export async function updateUser(id: string, input: UserInput | null): Promise<ManagedUser> {
  const actor = await assertCanManageUsers();
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new Error("User tidak ditemukan.");
  const body = input || {};
  const data = normalizeUserInput({ ...before, ...body }, { requireRole: true });
  const password = normalizePasswordInput(body.password);
  if (password) assertPasswordStrength(password, "Password baru");
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
      isActive: nextIsActive,
      ...(password ? {
        passwordHash: hashPassword(password),
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null
      } : {})
    }
  });
  const action = before.isActive !== after.isActive ? (after.isActive ? "enable" : "disable") : "update";
  const safeBefore = toManagedUser(before);
  const safeAfter = toManagedUser(after);
  await recordAudit({ entityType: "user", entityId: after.id, action, beforeValue: safeBefore, afterValue: safeAfter, reason: password ? "User password direset" : "User management update" });
  return safeAfter;
}
