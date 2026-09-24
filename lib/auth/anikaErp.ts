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
    posisi?: unknown;
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

export function roleFromAnika(value: unknown, posisiValue?: unknown): Role {
  const roles = Array.isArray(value) ? value.map((role) => String(role).trim().toLowerCase()) : [];
  const posisi = typeof posisiValue === "string" ? posisiValue.trim().toLowerCase() : "";

  if (roles.includes("super admin") || roles.includes("owner") || roles.includes("it support")) return "OWNER";
  if (roles.includes("supervisor")) return "SUPERVISOR";
  if (
    roles.includes("admin") ||
    roles.includes("admin inventory") ||
    roles.includes("kasir") ||
    roles.includes("sales") ||
    roles.includes("purchasing")
  ) {
    return "ADMIN";
  }
  if (
    roles.includes("finance") ||
    roles.includes("finance manager") ||
    roles.includes("admin keuangan") ||
    roles.includes("accounting")
  ) {
    return "FINANCE";
  }
  if (
    roles.includes("manager") ||
    roles.includes("sales manager") ||
    roles.includes("inventory manager") ||
    roles.includes("purchasing manager")
  ) {
    return "MANAGER";
  }
  if (
    roles.includes("delivery driver") ||
    roles.includes("delivery_driver") ||
    roles.includes("delivery") ||
    roles.includes("driver") ||
    roles.includes("kurir") ||
    roles.includes("petugas do") ||
    roles.includes("petugas_do") ||
    roles.includes("warehouse staff") ||
    roles.includes("warehouse_staff") ||
    roles.includes("staff gudang") ||
    roles.includes("gudang") ||
    roles.includes("checker") ||
    roles.includes("logistik")
  ) {
    return "DELIVERY_DRIVER";
  }

  // Fallback ke field "Posisi" jika Level/roles di ERP belum dipilih atau kosong
  if (posisi) {
    if (posisi.includes("super admin") || posisi.includes("owner")) return "OWNER";
    if (posisi.includes("supervisor")) return "SUPERVISOR";
    if (
      posisi.includes("driver") ||
      posisi.includes("kurir") ||
      posisi.includes("delivery") ||
      posisi.includes("petugas do") ||
      posisi.includes("do") ||
      posisi.includes("gudang") ||
      posisi.includes("warehouse") ||
      posisi.includes("checker") ||
      posisi.includes("pengiriman") ||
      posisi.includes("logistik")
    ) {
      return "DELIVERY_DRIVER";
    }
    if (posisi.includes("finance") || posisi.includes("keuangan") || posisi.includes("akunting") || posisi.includes("accounting")) return "FINANCE";
    if (posisi.includes("manager")) return "MANAGER";
    if (posisi.includes("admin") || posisi.includes("kasir") || posisi.includes("sales")) return "ADMIN";
  }

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

  let response: Response;
  try {
    response = await fetch(loginUrl(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, app: "slm" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Koneksi ke server Aneka Jaya melebihi batas waktu (timeout). Silakan coba beberapa saat lagi.");
    }
    throw new Error("Server Aneka Jaya sedang tidak aktif atau tidak dapat dihubungi. Pastikan server ERP berjalan.");
  }
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
  const role = roleFromAnika(userData.roles, (userData as { posisi?: unknown }).posisi);
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
