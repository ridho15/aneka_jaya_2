declare module "@/scripts/auth-gateway.mjs" {
  import type { Server } from "http";

  export function createAuthGatewayServer(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): Server;
}

declare module "@/scripts/auth-password.mjs" {
  export function hashPassword(password: string, salt?: string): string;
  export function verifyPassword(password: string, encodedHash: string): boolean;
}

declare module "@/scripts/check-core-readiness.mjs" {
  import type { PrismaClient } from "@prisma/client";

  type ReadinessCheck = {
    name: string;
    ok: boolean;
    recommendation: string | null;
    details?: unknown;
  };

  export function checkCoreReadiness(
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
    prisma?: PrismaClient
  ): Promise<{ ok: boolean; passed: string[]; failed: ReadinessCheck[] }>;
}
