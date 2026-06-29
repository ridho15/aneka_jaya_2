import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { landingPageForRole, type Role } from "./roles";
import { setLocalSessionCookie } from "./localSession";

export const ANIKA_ERP_TOKEN_COOKIE = "aneka_jaya_erp_token";
const INVALID_MESSAGE = "Email atau password ERP tidak valid.";

type AnikaLoginResponse = {
  token?: unknown;
  token_type?: unknown;
  expires_in_minutes?: unknown;
  issued_by?: {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    roles?: unknown;
  };
};

function roleFromAnika(value: unknown): Role {
  const roles = Array.isArray(value) ? value.map((role) => String(role).trim().toLowerCase()) : [];
  if (roles.includes("super admin") || roles.includes("owner")) return "OWNER";
  if (roles.includes("admin")) return "ADMIN";
  if (roles.includes("finance")) return "FINANCE";
  if (roles.includes("manager")) return "MANAGER";
  return "VIEWER";
}

function loginUrl() {
  const baseUrl = process.env.ANIKA_ERP_API_BASE_URL?.trim();
  if (!baseUrl) throw new Error("Konfigurasi ERP belum lengkap.");
  return `${baseUrl.replace(/\/$/, "")}/auth/login`;
}

export async function setAnikaErpTokenCookie(token: string, expiresInMinutes: number) {
  const cookieStore = await cookies();
  cookieStore.set(ANIKA_ERP_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor(expiresInMinutes * 60))
  });
}

export async function clearAnikaErpTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ANIKA_ERP_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function currentAnikaErpToken() {
  try {
    return (await cookies()).get(ANIKA_ERP_TOKEN_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

export async function loginWithAnikaErp(input: unknown) {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const email = typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw new Error(INVALID_MESSAGE);

  const response = await fetch(loginUrl(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  const result = await response.json().catch(() => null) as AnikaLoginResponse | null;
  if (!response.ok || typeof result?.token !== "string" || !result.token) {
    throw new Error(response.status === 401 || response.status === 422 ? INVALID_MESSAGE : "Login ERP sedang tidak tersedia.");
  }

  const issuedBy = result.issued_by || {};
  const issuedEmail = typeof issuedBy.email === "string" ? issuedBy.email.trim().toLowerCase() : email;
  const externalId = `anika:${String(issuedBy.id || issuedEmail)}`;
  const name = typeof issuedBy.name === "string" && issuedBy.name.trim() ? issuedBy.name.trim() : issuedEmail;
  const role = roleFromAnika(issuedBy.roles);
  const existing = await prisma.user.findFirst({ where: { OR: [{ externalId }, { email: issuedEmail }] } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { externalId, email: issuedEmail, name, role, isActive: true, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
      })
    : await prisma.user.create({
        data: { id: crypto.randomUUID(), externalId, email: issuedEmail, name, role, isActive: true, lastLoginAt: new Date() }
      });

  const expiresInMinutes = Number(result.expires_in_minutes) || 720;
  await setLocalSessionCookie(user.externalId);
  await setAnikaErpTokenCookie(result.token, expiresInMinutes);
  await prisma.auditLog.create({
    data: {
      id: crypto.randomUUID(),
      entityType: "user",
      entityId: user.externalId,
      action: "login",
      userId: user.externalId,
      userNameSnapshot: user.name,
      userRoleSnapshot: user.role,
      reason: "Login Anika ERP berhasil"
    }
  }).catch(() => undefined);

  return {
    user: { id: user.externalId, name: user.name, role: user.role },
    redirectTo: landingPageForRole(user.role)
  };
}
