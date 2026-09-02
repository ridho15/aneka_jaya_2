import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { landingPageForRole, type Role } from "./roles";
import { setLocalSessionCookie } from "./localSession";

export const ANIKA_ERP_TOKEN_COOKIE = "aneka_jaya_erp_token";
const INVALID_MESSAGE = "Email atau password ERP tidak valid.";

type AnikaVerifyUserResponse = {
  success?: boolean;
  message?: string;
  user?: {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    username?: unknown;
    roles?: unknown;
    allowed_apps?: unknown;
    status?: unknown;
  };
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
  if (roles.includes("supervisor")) return "SUPERVISOR";
  if (roles.includes("admin")) return "ADMIN";
  if (roles.includes("finance")) return "FINANCE";
  if (roles.includes("manager")) return "MANAGER";
  return "VIEWER";
}

function loginUrl() {
  const baseUrl = process.env.ANIKA_ERP_API_BASE_URL?.trim();
  if (!baseUrl) throw new Error("Konfigurasi ERP belum lengkap.");
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/auth/verify-user") ? normalized : `${normalized}/auth/verify-user`;
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
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password) throw new Error(INVALID_MESSAGE);

  const response = await fetch(loginUrl(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, app: "slm" }),
    cache: "no-store"
  });
  const result = await response.json().catch(() => null) as AnikaVerifyUserResponse | null;
  if (!response.ok || result?.success === false) {
    if (response.status === 403) {
      throw new Error(result?.message || "Akun Anda tidak memiliki izin untuk mengakses aplikasi SLM.");
    }
    if (response.status === 401 || response.status === 422) {
      throw new Error(result?.message || INVALID_MESSAGE);
    }
    throw new Error(result?.message || "Login ERP sedang tidak tersedia.");
  }

  const userData = result?.user || result?.issued_by || {};
  const issuedEmail = typeof userData.email === "string" ? userData.email.trim().toLowerCase() : identifier.toLowerCase();
  const externalId = `anika:${String(userData.id || (userData as { username?: unknown }).username || issuedEmail)}`;
  const name = typeof userData.name === "string" && userData.name.trim() ? userData.name.trim() : issuedEmail;
  const role = roleFromAnika(userData.roles);
  const existing = await prisma.user.findFirst({ where: { OR: [{ externalId }, { email: issuedEmail }] } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { externalId, email: issuedEmail, name, role, isActive: true, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
      })
    : await prisma.user.create({
        data: { id: crypto.randomUUID(), externalId, email: issuedEmail, name, role, isActive: true, lastLoginAt: new Date() }
      });

  const token = typeof result?.token === "string" && result.token ? result.token : process.env.ANIKA_ERP_API_TOKEN || "verified_user";
  const expiresInMinutes = Number(result?.expires_in_minutes) || 720;
  await setLocalSessionCookie(user.externalId);
  await setAnikaErpTokenCookie(token, expiresInMinutes);
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
