import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CurrentUser } from "@/lib/auth/session";

export async function findActiveUserByExternalId(externalId: string, options?: { touchLastLogin?: boolean }): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({ where: { externalId } });
  if (!user || !user.isActive) return null;
  if (options?.touchLastLogin) {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }
  return { id: user.externalId, name: user.name, role: user.role };
}
