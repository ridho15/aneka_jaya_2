import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ROLES, ROLE_COOKIE, type Role } from "./roles";

export const LOCAL_SESSION_COOKIE = "aneka_jaya_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  externalId: string;
  name?: string;
  role?: Role;
  exp: number;
};

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SESSION_SECRET wajib diisi untuk login internal.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (!parsed.externalId || typeof parsed.externalId !== "string") return null;
    if (!parsed.exp || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    const role = ROLES.includes(parsed.role as Role) ? parsed.role as Role : undefined;
    return {
      externalId: parsed.externalId,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      role,
      exp: parsed.exp
    };
  } catch {
    return null;
  }
}

export function createSessionToken(externalId: string) {
  const payload = encodePayload({ externalId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return decodePayload(payload);
}

export async function setLocalSessionCookie(externalId: string, role?: Role) {
  const cookieStore = await cookies();
  cookieStore.set(LOCAL_SESSION_COOKIE, createSessionToken(externalId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  if (role) {
    cookieStore.set(ROLE_COOKIE, role, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    });
  }
  cookieStore.set("aneka_jaya_erp_token", `local-session-${externalId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function clearLocalSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
