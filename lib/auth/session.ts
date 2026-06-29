import "server-only";
import { cookies, headers } from "next/headers";
import { type Role } from "./roles";
import { isProductionAuthRuntime, resolveAuthProvider, resolveRequestUser, shouldAllowTrustedHeaderRoleFallback, unauthenticatedUser, type ResolvedUser } from "./request";
import { findActiveUserByExternalId } from "@/lib/users/authLookup";

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

export async function getCurrentRole(): Promise<Role> {
  return (await getCurrentUser()).role;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return resolveAuthProvider() === "trusted_header" ? getTrustedHeaderUser() : getDemoUser();
}
