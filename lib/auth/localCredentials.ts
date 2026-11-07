import "server-only";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "./password";
import { setLocalSessionCookie } from "./localSession";
import { landingPageForRole, type Role } from "./roles";

const MAX_FAILED_LOGIN = 5;
const LOCK_MINUTES = 15;
const INVALID_MESSAGE = "Username atau password tidak valid.";
const LOCKED_MESSAGE = "Akun terkunci sementara. Coba lagi nanti atau hubungi Super Admin.";

async function lockAccount(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
    data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) }
  });
}

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function recordLoginAudit(user: { externalId: string; name: string; role: Role }) {
  await prisma.auditLog.create({
    data: {
      id: crypto.randomUUID(),
      entityType: "user",
      entityId: user.externalId,
      action: "login",
      userId: user.externalId,
      userNameSnapshot: user.name,
      userRoleSnapshot: user.role,
      reason: "Login internal berhasil"
    }
  }).catch(() => undefined);
}

/**
 * Cocokkan username atau email tanpa peduli huruf besar/kecil. Username tanpa "@" juga cocok
 * dengan akun Aneka Jaya ERP ("anika:<username>") dan bagian depan email, asal hanya satu akun.
 */
export async function findUserByIdentifier(identifier: string) {
  const exact = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: "insensitive" } },
        { externalId: { equals: identifier, mode: "insensitive" } },
        { externalId: { equals: `anika:${identifier}`, mode: "insensitive" } }
      ]
    }
  });
  if (exact || identifier.includes("@")) return exact;
  const byEmailName = await prisma.user.findMany({
    where: { email: { startsWith: `${identifier}@`, mode: "insensitive" } },
    take: 2
  });
  return byEmailName.length === 1 ? byEmailName[0] : null;
}

export async function loginWithPassword(input: unknown) {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const identifier = normalizeIdentifier(body.identifier);
  const password = normalizePassword(body.password);
  if (!identifier || !password) throw new Error(INVALID_MESSAGE);

  const user = await findUserByIdentifier(identifier);

  if (!user || !user.isActive) throw new Error(INVALID_MESSAGE);
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) throw new Error(LOCKED_MESSAGE);
  if (user.lockedUntil) {
    await prisma.user.updateMany({ where: { id: user.id, lockedUntil: { lte: now } }, data: { failedLoginCount: 0, lockedUntil: null } });
  }

  // Tiap percobaan mengambil satu jatah secara atomik sebelum password dicek, jadi tebakan paralel tetap dibatasi 5.
  const reserved = await prisma.user.updateMany({
    where: { id: user.id, failedLoginCount: { lt: MAX_FAILED_LOGIN }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    data: { failedLoginCount: { increment: 1 } }
  });
  if (reserved.count === 0) {
    await lockAccount(user.id);
    throw new Error(LOCKED_MESSAGE);
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { failedLoginCount: true } });
    if ((after?.failedLoginCount ?? MAX_FAILED_LOGIN) >= MAX_FAILED_LOGIN) await lockAccount(user.id);
    throw new Error(INVALID_MESSAGE);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    }
  });
  await setLocalSessionCookie(user.externalId, user.role);
  await recordLoginAudit(user);

  return {
    user: {
      id: user.externalId,
      name: user.name,
      role: user.role
    },
    redirectTo: landingPageForRole(user.role)
  };
}
