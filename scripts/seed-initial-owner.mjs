import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();
const KEY_LENGTH = 64;

function hashPassword(password) {
  const normalized = password.trim();
  if (normalized.length < 8) throw new Error("INITIAL_OWNER_PASSWORD minimal 8 karakter.");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(normalized, salt, KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function ownerPasswordHash() {
  const explicitHash = process.env.INITIAL_OWNER_PASSWORD_HASH?.trim();
  if (explicitHash) return explicitHash;
  const password = process.env.INITIAL_OWNER_PASSWORD?.trim();
  if (process.env.AUTH_PROVIDER === "local_credentials" && !password) {
    throw new Error("INITIAL_OWNER_PASSWORD atau INITIAL_OWNER_PASSWORD_HASH wajib diisi untuk login internal.");
  }
  return password ? hashPassword(password) : null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi untuk seed initial owner.");
  const existingOwner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  if (existingOwner) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "Active OWNER already exists" }, null, 2));
    return;
  }
  const externalId = process.env.INITIAL_OWNER_EXTERNAL_ID?.trim();
  if (!externalId) throw new Error("INITIAL_OWNER_EXTERNAL_ID wajib diisi untuk membuat Owner pertama.");
  const passwordHash = ownerPasswordHash();
  const user = await prisma.user.upsert({
    where: { externalId },
    update: {
      role: "OWNER",
      isActive: true,
      name: process.env.INITIAL_OWNER_NAME?.trim() || "Owner",
      email: process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase() || null,
      ...(passwordHash ? {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null
      } : {})
    },
    create: {
      id: crypto.randomUUID(),
      externalId,
      email: process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase() || null,
      name: process.env.INITIAL_OWNER_NAME?.trim() || "Owner",
      role: "OWNER",
      isActive: true,
      passwordHash,
      passwordUpdatedAt: passwordHash ? new Date() : null,
      failedLoginCount: 0,
      lockedUntil: null
    }
  });
  console.log(JSON.stringify({ ok: true, user: { id: user.id, externalId: user.externalId, email: user.email, name: user.name, role: user.role } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
