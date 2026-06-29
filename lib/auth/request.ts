import { parseRole, ROLE_COOKIE, roleLabel, type Role } from "./roles";

export type AuthProvider = "demo" | "trusted_header" | "local_credentials" | "anika_erp";

export type ResolvedUser = {
  id: string;
  name: string;
  role: Role;
};

type CookieReader = {
  get(name: string): { value?: string } | undefined;
};

type RequestLike = {
  headers: Pick<Headers, "get">;
  cookies?: CookieReader;
};

type AuthEnv = Partial<Record<
  | "APP_ACTOR_ID"
  | "APP_ACTOR_NAME"
  | "APP_DEFAULT_ROLE"
  | "AUTH_ALLOW_DEMO_IN_PRODUCTION"
  | "AUTH_HEADER_USER_ID"
  | "AUTH_HEADER_USER_NAME"
  | "AUTH_HEADER_USER_ROLE"
  | "AUTH_PROVIDER"
  | "AUTH_TRUSTED_HEADER_SECRET"
  | "AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER"
  | "NEXT_PUBLIC_APP_MODE"
  | "NODE_ENV",
  string
>>;

export function isProductionAuthRuntime(env: AuthEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.NEXT_PUBLIC_APP_MODE === "production";
}

export function resolveAuthProvider(env: AuthEnv = process.env): AuthProvider {
  if (env.AUTH_PROVIDER === "demo" || env.AUTH_PROVIDER === "trusted_header" || env.AUTH_PROVIDER === "local_credentials" || env.AUTH_PROVIDER === "anika_erp") return env.AUTH_PROVIDER;
  return isProductionAuthRuntime(env) ? "local_credentials" : "demo";
}

export function unauthenticatedUser(): ResolvedUser {
  return { id: "unauthenticated", name: roleLabel("VIEWER"), role: "VIEWER" };
}

function readCookie(request: RequestLike, name: string) {
  const directCookie = request.cookies?.get(name)?.value;
  if (directCookie) return directCookie;
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function resolveDemoUser(request: RequestLike, env: AuthEnv): ResolvedUser {
  if (isProductionAuthRuntime(env) && env.AUTH_ALLOW_DEMO_IN_PRODUCTION !== "true") {
    return unauthenticatedUser();
  }
  const role = parseRole(readCookie(request, ROLE_COOKIE) || env.APP_DEFAULT_ROLE);
  return {
    id: env.APP_ACTOR_ID || `local-${role.toLowerCase()}`,
    name: env.APP_ACTOR_NAME || roleLabel(role),
    role
  };
}

function hasTrustedHeaderAccess(request: RequestLike, env: AuthEnv) {
  const requiredSecret = env.AUTH_TRUSTED_HEADER_SECRET;
  if (requiredSecret) return request.headers.get("x-aneka-auth-secret") === requiredSecret;
  return !isProductionAuthRuntime(env);
}

export function shouldAllowTrustedHeaderRoleFallback(env: AuthEnv = process.env): boolean {
  return env.AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER === "true" && env.NEXT_PUBLIC_APP_MODE !== "production";
}

function resolveTrustedHeaderUser(request: RequestLike, env: AuthEnv): ResolvedUser {
  if (!hasTrustedHeaderAccess(request, env)) return unauthenticatedUser();
  const id = request.headers.get(env.AUTH_HEADER_USER_ID || "x-aneka-user-id");
  if (!id) return unauthenticatedUser();
  const role = isProductionAuthRuntime(env) && !shouldAllowTrustedHeaderRoleFallback(env)
    ? "VIEWER"
    : parseRole(request.headers.get(env.AUTH_HEADER_USER_ROLE || "x-aneka-user-role"), "VIEWER");
  return {
    id,
    name: request.headers.get(env.AUTH_HEADER_USER_NAME || "x-aneka-user-name") || roleLabel(role),
    role
  };
}

export function resolveRequestUser(request: RequestLike, env: AuthEnv = process.env): ResolvedUser {
  const provider = resolveAuthProvider(env);
  if (provider === "trusted_header") return resolveTrustedHeaderUser(request, env);
  if (provider === "local_credentials" || provider === "anika_erp") return unauthenticatedUser();
  return resolveDemoUser(request, env);
}

export function resolveRequestRole(request: RequestLike, env: AuthEnv = process.env): Role {
  return resolveRequestUser(request, env).role;
}
