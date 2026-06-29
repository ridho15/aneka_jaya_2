declare module "@/scripts/check-production-env.mjs" {
  export function validateProductionEnv(env: Record<string, string | undefined>): string[];
}

declare module "@/scripts/smoke-auth.mjs" {
  type SmokeEnv = Record<string, string | undefined>;
  export function appUrl(path: string, env?: SmokeEnv): string;
  export function smokeHeaders(externalId: string, env?: SmokeEnv): Record<string, string>;
  export function runAuthSmoke(env?: SmokeEnv, fetchImpl?: typeof fetch): Promise<{ ok: boolean; checks: string[] }>;
}
