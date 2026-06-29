import { landingPageForRole, type Role } from "./roles";

export function ssoLoginUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_SSO_LOGIN_URL?.trim() || null;
}

export function shouldRedirectAuthenticatedLogin(role: Role) {
  return role.length > 0;
}

export function authenticatedLoginTarget(role: Role) {
  return landingPageForRole(role);
}
