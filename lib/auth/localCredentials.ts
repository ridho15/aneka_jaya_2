import "server-only";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "./password";
import { setLocalSessionCookie } from "./localSession";
import { landingPageForRole } from "./roles";

const MAX_FAILED_LOGIN = 5;
const LOCK_MINUTES = 15;
const INVALID_MESSAGE = "Email/username atau password tidak valid.";

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function recordLoginAudit(user: { externalId: string; name: string; role: "OWNER" | "ADMIN" | "FINANCE" | "MANAGER" | "VIEWER" }) {
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

export async function loginWithPassword(input: unknown) {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const identifier = normalizeIdentifier(body.identifier);
  const password = normalizePassword(body.password);
  if (!identifier || !password) throw new Error(INVALID_MESSAGE);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { externalId: identifier }
      ]
    }
  });

  if (!user || !user.isActive) throw new Error(INVALID_MESSAGE);
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error("Akun terkunci sementara. Coba lagi nanti atau hubungi Super Admin.");
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil = failedLoginCount >= MAX_FAILED_LOGIN
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
      : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil }
    });
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
  await setLocalSessionCookie(user.externalId);
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
