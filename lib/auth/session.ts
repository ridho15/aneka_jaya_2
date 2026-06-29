import "server-only";
import { cookies, headers } from "next/headers";
import { type Role } from "./roles";
import { isProductionAuthRuntime, resolveAuthProvider, resolveRequestUser, shouldAllowTrustedHeaderRoleFallback, unauthenticatedUser, type ResolvedUser } from "./request";
import { LOCAL_SESSION_COOKIE, readSessionToken } from "./localSession";
import { findActiveUserByExternalId } from "@/lib/users/authLookup";
import { ANIKA_ERP_TOKEN_COOKIE } from "./anikaErp";

export type CurrentUser = ResolvedUser;

async function getDemoUser(): Promise<CurrentUser> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  return resolveRequestUser({ headers: requestHeaders, cookies: cookieStore });
}

async function getTrustedHeaderUser(): Promise<CurrentUser> {
  try {
    const requestHeaders = await headers();
    const headerUser = resolveRequestUser({ headers: requestHeaders });
    if (headerUser.id === "unauthenticated") return headerUser;
    try {
      const dbUser = await findActiveUserByExternalId(headerUser.id, { touchLastLogin: true });
      if (dbUser) return dbUser;
    } catch {
      if (isProductionAuthRuntime() && !shouldAllowTrustedHeaderRoleFallback()) return unauthenticatedUser();
    }
    return isProductionAuthRuntime() && !shouldAllowTrustedHeaderRoleFallback() ? unauthenticatedUser() : headerUser;
  } catch {
    return unauthenticatedUser();
  }
}

async function getLocalCredentialsUser(requireErpToken = false): Promise<CurrentUser> {
  try {
    const cookieStore = await cookies();
    if (requireErpToken && !cookieStore.get(ANIKA_ERP_TOKEN_COOKIE)?.value) return unauthenticatedUser();
    const session = readSessionToken(cookieStore.get(LOCAL_SESSION_COOKIE)?.value);
    if (!session) return unauthenticatedUser();
    try {
      const dbUser = await findActiveUserByExternalId(session.externalId, { touchLastLogin: false });
      if (dbUser) return dbUser;
    } catch {
      // Visual QA can run without a local database; production-like auth still requires User lookup.
    }
    if (process.env.AUTH_LOCAL_CREDENTIALS_ALLOW_VISUAL_FALLBACK === "true" && process.env.NEXT_PUBLIC_APP_MODE !== "production" && session.role) {
      return { id: session.externalId, name: session.name || session.externalId, role: session.role };
    }
    return unauthenticatedUser();
  } catch {
    return unauthenticatedUser();
  }
}

export async function getCurrentRole(): Promise<Role> {
  return (await getCurrentUser()).role;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const provider = resolveAuthProvider();
  if (provider === "trusted_header") return getTrustedHeaderUser();
  if (provider === "local_credentials" || provider === "anika_erp") return getLocalCredentialsUser(provider === "anika_erp");
  return getDemoUser();
}
