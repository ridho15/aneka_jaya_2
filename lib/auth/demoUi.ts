import { resolveAuthProvider } from "./request";

export function isDemoRoleSelectorEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production"
    && resolveAuthProvider(env) === "demo"
    && env.AUTH_ENABLE_DEMO_ROLE_SELECTOR === "true";
}

export function shouldShowDemoLogout(env: NodeJS.ProcessEnv = process.env) {
  return isDemoRoleSelectorEnabled(env);
}
