import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CurrentUser } from "@/lib/auth/session";

export type UserProfile = CurrentUser & {
  email?: string | null;
  lastLoginAt?: Date | null;
};

export async function getUserProfile(user: CurrentUser): Promise<UserProfile> {
  if (user.id === "unauthenticated") return user;
  const row = await prisma.user.findUnique({
    where: { externalId: user.id },
    select: { email: true, lastLoginAt: true }
  }).catch(() => null);
  return { ...user, email: row?.email, lastLoginAt: row?.lastLoginAt };
}
