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
